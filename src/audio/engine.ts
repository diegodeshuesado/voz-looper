import type { Action } from '../controls';
import { ardillaRate, echoParams, filterParams, reverbParams, stutterSamples } from '../fx/knobs';
import { makeImpulse } from '../fx/reverb';
import fxUrl from '../fx/fx-worklet.ts?worker&url';
import type { TrackState } from '../looper/looper-core';
import looperUrl from '../looper/looper-worklet.ts?worker&url';

export type MicError = 'mic-denied' | 'mic-missing' | 'mic-busy' | 'insecure';

export interface EngineEvents {
  onStates(states: TrackState[]): void;
  onMic(open: boolean): void;
  onReverse(on: boolean): void;
  onStutter(on: boolean): void;
  onError(kind: MicError): void;
}

export interface MicDevice {
  id: string;
  label: string;
}

const SMOOTH = 0.005; // ~20 ms
const ECHO_SECONDS = 0.375;

interface Nodes {
  micGate: GainNode;
  looper: AudioWorkletNode;
  fx: AudioWorkletNode;
  hp: BiquadFilterNode;
  lp: BiquadFilterNode;
  echoWet: GainNode;
  echoFb: GainNode;
  revWet: GainNode;
  revDry: GainNode;
  master: GainNode;
}

export class Engine {
  private states: TrackState[] = ['empty', 'empty', 'empty', 'empty'];
  private base: number | null = null;
  private micOpen = false;
  private reverse = false;
  private levelBuf = new Float32Array(1024);
  private source: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode;
  private micRequest = 0;

  private constructor(
    private ctx: AudioContext,
    private n: Nodes,
    private ev: EngineEvents,
  ) {
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    n.looper.port.onmessage = (e: MessageEvent<{ states: TrackState[]; baseLength: number | null }>) => {
      this.states = e.data.states;
      this.base = e.data.baseLength;
      ev.onStates(this.states);
    };
  }

  /** Debe llamarse tras un toque del usuario (política de audio del navegador). */
  static async create(ev: EngineEvents): Promise<Engine> {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.resume();
    await Promise.all([ctx.audioWorklet.addModule(looperUrl), ctx.audioWorklet.addModule(fxUrl)]);

    const mono = { channelCount: 1, channelCountMode: 'explicit' as const };
    const latencySamples = Math.round((ctx.baseLatency + (ctx.outputLatency || 0)) * ctx.sampleRate);
    const looper = new AudioWorkletNode(ctx, 'looper', {
      ...mono, numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1],
      processorOptions: { latencySamples },
    });
    const fx = new AudioWorkletNode(ctx, 'fx', { ...mono, numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });

    const micGate = ctx.createGain();
    micGate.gain.value = 0;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 20;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 20000;

    const echoIn = ctx.createGain();
    const delay = ctx.createDelay(1);
    delay.delayTime.value = ECHO_SECONDS;
    const echoWet = ctx.createGain();
    echoWet.gain.value = 0;
    const echoFb = ctx.createGain();
    echoFb.gain.value = 0;

    const revIn = ctx.createGain();
    const convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse(ctx, 4);
    const revDry = ctx.createGain();
    const revWet = ctx.createGain();
    revWet.gain.value = 0;

    const master = ctx.createGain();
    master.gain.value = (100 / 127) ** 2;
    // Limitador: evita que se sature al encimar loops y efectos.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;

    // micro → looper; (micro + loops) → fx → filtro → eco → reverb → volumen → salida
    micGate.connect(looper);
    micGate.connect(fx);
    looper.connect(fx);
    fx.connect(hp).connect(lp).connect(echoIn);
    echoIn.connect(revIn);
    echoIn.connect(delay);
    delay.connect(echoWet).connect(revIn);
    delay.connect(echoFb).connect(delay);
    revIn.connect(revDry).connect(master);
    revIn.connect(convolver).connect(revWet).connect(master);
    master.connect(limiter).connect(ctx.destination);

    const engine = new Engine(ctx, { micGate, looper, fx, hp, lp, echoWet, echoFb, revWet, revDry, master }, ev);
    await engine.connectMic();
    return engine;
  }

  handle(a: Action): void {
    const t = this.ctx.currentTime;
    switch (a.type) {
      case 'loopTap':
        if (this.states[a.track] === 'empty' && !this.micOpen) this.setMicOpen(true);
        this.n.looper.port.postMessage({ type: 'tap', track: a.track });
        break;
      case 'loopHold':
        this.n.looper.port.postMessage({ type: 'clear', track: a.track });
        break;
      case 'toggleMic':
        this.setMicOpen(!this.micOpen);
        break;
      case 'toggleReverse':
        this.reverse = !this.reverse;
        this.n.looper.port.postMessage({ type: 'reverse', on: this.reverse });
        this.ev.onReverse(this.reverse);
        break;
      case 'stutter':
        this.n.fx.port.postMessage({ type: 'stutter', on: a.on, samples: stutterSamples(this.ctx.sampleRate, this.base) });
        this.ev.onStutter(a.on);
        break;
      case 'knob':
        this.knob(a.index, a.value, t);
        break;
      default:
        break; // autotune: paso 3
    }
  }

  private knob(index: number, v: number, t: number): void {
    const n = this.n;
    switch (index) {
      case 0:
        n.looper.port.postMessage({ type: 'rate', value: ardillaRate(v) });
        break;
      case 1:
        n.fx.port.postMessage({ type: 'robot', value: v });
        break;
      case 2: {
        const e = echoParams(v);
        n.echoWet.gain.setTargetAtTime(e.wet, t, SMOOTH);
        n.echoFb.gain.setTargetAtTime(e.feedback, t, SMOOTH);
        break;
      }
      case 3: {
        const r = reverbParams(v);
        n.revWet.gain.setTargetAtTime(r.wet, t, SMOOTH);
        n.revDry.gain.setTargetAtTime(r.dry, t, SMOOTH);
        break;
      }
      case 4: {
        const f = filterParams(v);
        n.hp.frequency.setTargetAtTime(f.hp, t, SMOOTH);
        n.lp.frequency.setTargetAtTime(f.lp, t, SMOOTH);
        n.hp.Q.setTargetAtTime(f.q, t, SMOOTH);
        n.lp.Q.setTargetAtTime(f.q, t, SMOOTH);
        break;
      }
      case 5:
        n.fx.port.postMessage({ type: 'lofi', value: v });
        break;
      case 7:
        n.master.gain.setTargetAtTime(v * v, t, SMOOTH);
        break;
    }
  }

  /** Micrófonos disponibles (los nombres aparecen después de dar permiso). */
  async listMics(): Promise<MicDevice[]> {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter((d) => d.kind === 'audioinput')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Micrófono ${i + 1}` }));
  }

  /** Cambia de micrófono sin tocar los loops ni la grabación en curso. */
  async setMicDevice(deviceId: string): Promise<void> {
    await this.connectMic(deviceId);
  }

  currentMicId(): string | undefined {
    return this.stream?.getAudioTracks()[0]?.getSettings().deviceId;
  }

  /** Nivel RMS del micrófono, 0..1. */
  inputLevel(): number {
    if (!this.source) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (const v of this.levelBuf) sum += v * v;
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 4);
  }

  private async connectMic(deviceId?: string): Promise<void> {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.ev.onError('insecure');
      return;
    }
    const request = ++this.micRequest;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
        },
      });
      if (request !== this.micRequest) {
        // Llegó tarde: ya se pidió otro micrófono después.
        stream.getTracks().forEach((tr) => tr.stop());
        return;
      }
      const source = this.ctx.createMediaStreamSource(stream);
      source.connect(this.n.micGate);
      source.connect(this.analyser);
      this.source?.disconnect();
      this.stream?.getTracks().forEach((tr) => tr.stop());
      this.source = source;
      this.stream = stream;
    } catch (e) {
      if (request !== this.micRequest) return;
      const name = (e as DOMException)?.name;
      this.ev.onError(
        name === 'NotFoundError' || name === 'OverconstrainedError'
          ? 'mic-missing'
          : name === 'NotReadableError'
            ? 'mic-busy'
            : 'mic-denied',
      );
    }
  }

  private setMicOpen(open: boolean): void {
    this.micOpen = open;
    this.n.micGate.gain.setTargetAtTime(open ? 1 : 0, this.ctx.currentTime, SMOOTH);
    this.ev.onMic(open);
  }
}
