// Corre dentro del AudioWorkletGlobalScope.
import { AutotuneCore } from './autotune-core';
import { SCALES, type ScaleName } from './scales';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: unknown);
}
declare function registerProcessor(name: string, ctor: unknown): void;

type Msg =
  | { type: 'enabled'; on: boolean }
  | { type: 'scale'; tonic: number; scale: ScaleName }
  | { type: 'retune'; value: number }
  | { type: 'force'; degree: number | null };

class AutotuneProcessor extends AudioWorkletProcessor {
  private core = new AutotuneCore(sampleRate);
  private silence = new Float32Array(128);
  private blocks = 0;
  private lastNote: number | null = null;

  constructor(options?: unknown) {
    super(options);
    this.port.onmessage = (ev: MessageEvent<Msg>) => {
      const m = ev.data;
      if (m.type === 'enabled') this.core.setEnabled(m.on);
      else if (m.type === 'scale') this.core.setScale(m.tonic, SCALES[m.scale]);
      else if (m.type === 'retune') this.core.setRetune(m.value);
      else if (m.type === 'force') this.core.setForcedDegree(m.degree);
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
    // Unas 10 veces por segundo, avisa la nota detectada si cambió.
    if (++this.blocks >= 37) {
      this.blocks = 0;
      const m = this.core.detectedMidi;
      const note = m === null ? null : Math.round(m);
      if (note !== this.lastNote) {
        this.lastNote = note;
        this.port.postMessage({ detected: note });
      }
    }
    return true;
  }
}

registerProcessor('autotune', AutotuneProcessor);
