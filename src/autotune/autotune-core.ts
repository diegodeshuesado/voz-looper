import { hzToMidi, nearestInScale, padNote, SCALES, type Scale } from './scales';
import { detectPitch } from './yin';

/**
 * Autotune: detecta la nota (YIN, a media frecuencia de muestreo) y cambia el tono con una
 * línea de retardo de dos cabezas. Solo suena una cabeza a la vez; al llegar al borde se
 * hace un fundido corto a la otra, saltando un número entero de periodos para que no se note.
 */
export class AutotuneCore {
  readonly latencySamples: number;
  detectedMidi: number | null = null;

  private enabled = true;
  private tonic = 0;
  private scale: Scale = SCALES.mayor;
  private forced: number | null = null;
  private retuneCoef = 1;

  // Análisis
  private readonly anaSize = 1024;
  private ana: Float32Array;
  private anaLin: Float32Array;
  private anaPos = 0;
  private decimHold = 0;
  private decimPhase = 0;
  private hopCount = 0;
  private readonly hop = 512;
  private scratch: Float32Array;
  private periodSamples = 0; // periodo detectado, a la frecuencia completa

  // Cambio de tono
  private shift = 0; // semitonos actuales
  private targetShift = 0;
  private buf: Float32Array;
  private readonly mask: number;
  private w = 0;
  private readonly dMin: number;
  private readonly dMax: number;
  private readonly win: number;
  private readonly fadeLen: number;
  private dAct: number;
  private dOther = 0;
  private fadePos = -1; // -1 = sin fundido

  constructor(private sampleRate: number) {
    const scale = sampleRate / 48000;
    this.win = Math.round(1024 * scale);
    this.fadeLen = Math.round(256 * scale);
    this.dMin = this.fadeLen + 4;
    this.dMax = this.dMin + this.win;
    this.latencySamples = Math.round(this.dMin + this.win / 2);
    this.dAct = this.latencySamples;
    let size = 1;
    while (size < this.dMax * 2 + this.fadeLen * 4) size <<= 1;
    this.buf = new Float32Array(size);
    this.mask = size - 1;
    this.ana = new Float32Array(this.anaSize);
    this.anaLin = new Float32Array(this.anaSize);
    this.scratch = new Float32Array(this.anaSize);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) {
      this.dAct = this.latencySamples;
      this.fadePos = -1;
      this.shift = this.targetShift = 0;
    }
  }

  setScale(tonic: number, scale: Scale): void {
    this.tonic = tonic;
    this.scale = scale;
  }

  /** 0 = suave (~200 ms), 1 = robot (salto inmediato). */
  setRetune(v: number): void {
    const tau = 0.2 * (1 - Math.min(1, Math.max(0, v)));
    this.retuneCoef = tau < 0.001 ? 1 : 1 - Math.exp(-1 / (tau * this.sampleRate));
  }

  setForcedDegree(i: number | null): void {
    this.forced = i;
  }

  process(input: Float32Array, output: Float32Array): void {
    for (let n = 0; n < output.length; n++) {
      const x = input[n] ?? 0;
      this.buf[this.w] = x;
      this.analyze(x);

      if (!this.enabled) {
        output[n] = this.buf[(this.w - this.latencySamples) & this.mask];
      } else {
        this.shift += (this.targetShift - this.shift) * this.retuneCoef;
        output[n] = this.shiftSample(2 ** (this.shift / 12));
      }
      this.w = (this.w + 1) & this.mask;
    }
  }

  private analyze(x: number): void {
    // Decima ×2 promediando pares.
    if (this.decimPhase === 0) {
      this.decimHold = x;
      this.decimPhase = 1;
    } else {
      this.ana[this.anaPos] = 0.5 * (this.decimHold + x);
      this.anaPos = (this.anaPos + 1) % this.anaSize;
      this.decimPhase = 0;
    }
    if (++this.hopCount < this.hop) return;
    this.hopCount = 0;

    for (let i = 0; i < this.anaSize; i++) this.anaLin[i] = this.ana[(this.anaPos + i) % this.anaSize];
    const hz = detectPitch(this.anaLin, this.sampleRate / 2, 70, 1000, 0.15, this.scratch);
    if (hz === null) {
      this.detectedMidi = null;
      this.periodSamples = 0;
      this.targetShift = 0;
      return;
    }
    const m = hzToMidi(hz);
    this.detectedMidi = m;
    this.periodSamples = this.sampleRate / hz;
    const target =
      this.forced !== null ? padNote(this.forced, this.tonic, this.scale, m) : nearestInScale(m, this.tonic, this.scale);
    this.targetShift = Math.max(-12, Math.min(12, target - m));
  }

  private shiftSample(ratio: number): number {
    const step = 1 - ratio; // la cabeza se aleja (más grave) o se acerca (más agudo)
    this.dAct += step;
    if (this.fadePos >= 0) this.dOther += step;

    if (this.fadePos < 0 && (this.dAct < this.dMin || this.dAct > this.dMax)) {
      const jump = this.jumpLength();
      this.dOther = this.dAct < this.dMin ? this.dAct + jump : this.dAct - jump;
      this.fadePos = 0;
    }

    const a = this.read(this.dAct);
    if (this.fadePos < 0) return a;
    const f = this.fadePos / this.fadeLen;
    // Fundido lineal: las dos cabezas están alineadas a periodos, así que se suman en fase.
    const y = a * (1 - f) + this.read(this.dOther) * f;
    if (++this.fadePos >= this.fadeLen) {
      this.dAct = this.dOther;
      this.fadePos = -1;
    }
    return y;
  }

  /** Salto de la cabeza nueva: ~3/4 de ventana, redondeado a periodos enteros de la voz. */
  private jumpLength(): number {
    const target = this.win * 0.75;
    const p = this.periodSamples;
    if (p <= 0 || p > this.win) return target;
    return Math.max(p, Math.round(target / p) * p);
  }

  private read(delay: number): number {
    const pos = this.w - delay;
    const i = Math.floor(pos);
    const frac = pos - i;
    const a = this.buf[i & this.mask];
    const b = this.buf[(i + 1) & this.mask];
    return a + (b - a) * frac;
  }
}
