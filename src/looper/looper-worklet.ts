// Corre dentro del AudioWorkletGlobalScope.
import { LooperCore, type TrackState } from './looper-core';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(name: string, ctor: unknown): void;

type Msg =
  | { type: 'tap' | 'clear'; track: number }
  | { type: 'rate'; value: number }
  | { type: 'reverse'; on: boolean };

class LooperProcessor extends AudioWorkletProcessor {
  private core: LooperCore;
  private last: TrackState[] = [];
  private silence = new Float32Array(128);

  constructor(options: { processorOptions?: { latencySamples?: number } }) {
    super(options);
    this.core = new LooperCore(sampleRate, {
      latencySamples: options.processorOptions?.latencySamples ?? 0,
    });
    this.port.onmessage = (ev: MessageEvent<Msg>) => {
      const m = ev.data;
      if (m.type === 'tap') this.core.tap(m.track);
      else if (m.type === 'clear') this.core.clear(m.track);
      else if (m.type === 'rate') this.core.setRate(m.value);
      else if (m.type === 'reverse') this.core.setReverse(m.on);
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
    const s = this.core.states;
    if (s.length === this.last.length && s.every((v, i) => v === this.last[i])) return;
    this.last = [...s];
    this.port.postMessage({ states: this.last, baseLength: this.core.baseLength });
  }
}

registerProcessor('looper', LooperProcessor);
