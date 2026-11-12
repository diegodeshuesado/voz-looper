// Corre dentro del AudioWorkletGlobalScope.
import { LooperCore, type TrackState } from './looper-core';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(name: string, ctor: unknown): void;

type Msg = { type: 'tap' | 'clear'; track: number };

class LooperProcessor extends AudioWorkletProcessor {
  private core: LooperCore;
  private last = '';
  private silence = new Float32Array(128);

  constructor(options: { processorOptions?: { latencySamples?: number } }) {
    super(options);
    this.core = new LooperCore(sampleRate, {
      latencySamples: options.processorOptions?.latencySamples ?? 0,
    });
    this.port.onmessage = (ev: MessageEvent<Msg>) => {
      if (ev.data.type === 'tap') this.core.tap(ev.data.track);
      else this.core.clear(ev.data.track);
      this.report();
    };
    this.report();
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0][0];
    let input = inputs[0]?.[0];
    if (!input || input.length !== out.length) {
      if (this.silence.length !== out.length) this.silence = new Float32Array(out.length);
      input = this.silence;
    }
    this.core.process(input, out);
    this.report(); // el auto-cierre a 30 s cambia estados desde aquí
    return true;
  }

  private report(): void {
    const key = this.core.states.join(',');
    if (key === this.last) return;
    this.last = key;
    this.port.postMessage({ states: [...this.core.states] as TrackState[] });
  }
}

registerProcessor('looper', LooperProcessor);
