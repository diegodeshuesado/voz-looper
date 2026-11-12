import type { Action } from '../controls';
import type { TrackState } from '../looper/looper-core';
import looperUrl from '../looper/looper-worklet.ts?worker&url';

export interface EngineEvents {
  onStates(states: TrackState[]): void;
  onMic(open: boolean): void;
  onError(kind: 'mic-denied' | 'insecure'): void;
}

const SMOOTH = 0.005; // ~20 ms

export class Engine {
  private states: TrackState[] = ['empty', 'empty', 'empty', 'empty'];
  private micOpen = false;
  private levelBuf = new Float32Array(1024);

  private constructor(
    private ctx: AudioContext,
    private looper: AudioWorkletNode,
    private micGate: GainNode,
    private master: GainNode,
    private analyser: AnalyserNode | null,
    private ev: EngineEvents,
  ) {
    looper.port.onmessage = (e: MessageEvent<{ states: TrackState[] }>) => {
      this.states = e.data.states;
      ev.onStates(this.states);
    };
  }

  /** Debe llamarse tras un toque del usuario (política de audio del navegador). */
  static async create(ev: EngineEvents): Promise<Engine> {
    const ctx = new AudioContext({ latencyHint: 'interactive' });
    await ctx.resume();
    await ctx.audioWorklet.addModule(looperUrl);

    const latencySamples = Math.round((ctx.baseLatency + (ctx.outputLatency || 0)) * ctx.sampleRate);
    const looper = new AudioWorkletNode(ctx, 'looper', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      processorOptions: { latencySamples },
    });
    const micGate = ctx.createGain();
    micGate.gain.value = 0;
    const master = ctx.createGain();
    master.gain.value = (100 / 127) ** 2;

    micGate.connect(looper);
    micGate.connect(master);
    looper.connect(master);
    master.connect(ctx.destination);

    let analyser: AnalyserNode | null = null;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      ev.onError('insecure');
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
        const source = ctx.createMediaStreamSource(stream);
        source.connect(micGate);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
      } catch {
        ev.onError('mic-denied');
      }
    }
    return new Engine(ctx, looper, micGate, master, analyser, ev);
  }

  handle(a: Action): void {
    switch (a.type) {
      case 'loopTap':
        if (this.states[a.track] === 'empty' && !this.micOpen) this.setMic(true);
        this.looper.port.postMessage({ type: 'tap', track: a.track });
        break;
      case 'loopHold':
        this.looper.port.postMessage({ type: 'clear', track: a.track });
        break;
      case 'toggleMic':
        this.setMic(!this.micOpen);
        break;
      case 'knob':
        if (a.index === 7) this.master.gain.setTargetAtTime(a.value * a.value, this.ctx.currentTime, SMOOTH);
        break;
      default:
        break; // pasos 2–4
    }
  }

  /** Nivel RMS del micrófono, 0..1. */
  inputLevel(): number {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (const v of this.levelBuf) sum += v * v;
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 4);
  }

  private setMic(open: boolean): void {
    this.micOpen = open;
    this.micGate.gain.setTargetAtTime(open ? 1 : 0, this.ctx.currentTime, SMOOTH);
    this.ev.onMic(open);
  }
}
