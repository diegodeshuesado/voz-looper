// Corre dentro del AudioWorkletGlobalScope.
import { FxCore } from './fx-core';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(name: string, ctor: unknown): void;

type Msg =
  | { type: 'robot' | 'lofi'; value: number }
  | { type: 'stutter'; on: boolean; samples: number };

class FxProcessor extends AudioWorkletProcessor {
  private core = new FxCore(sampleRate);
  private silence = new Float32Array(128);

  constructor(options?: unknown) {
    super(options);
    this.port.onmessage = (ev: MessageEvent<Msg>) => {
      const m = ev.data;
      if (m.type === 'robot') this.core.setRobot(m.value);
      else if (m.type === 'lofi') this.core.setLofi(m.value);
      else if (m.type === 'stutter') this.core.setStutter(m.on, m.samples);
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0][0];
    let input = inputs[0]?.[0];
    if (!input || input.length !== out.length) {
      if (this.silence.length !== out.length) this.silence = new Float32Array(out.length);
      input = this.silence;
    }
    this.core.process(input, out);
    return true;
  }
}

registerProcessor('fx', FxProcessor);
