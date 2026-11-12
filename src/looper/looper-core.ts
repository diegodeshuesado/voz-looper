export type TrackState = 'empty' | 'recording' | 'playing' | 'muted';

export interface LooperOptions {
  maxSeconds?: number;
  latencySamples?: number;
  tracks?: number;
  /** Suaviza los cambios de velocidad (~20 ms). Las pruebas lo apagan. */
  smoothing?: boolean;
}

interface Track {
  state: TrackState;
  buf: Float32Array;
  start: number; // posición virtual donde empezó a grabar
  recorded: number; // índice más alto escrito + 1
  recDir: 1 | -1; // dirección en que se grabó (al revés se voltea al cerrar)
  last: number; // última muestra escrita (para rellenar huecos)
  length: number; // duración del loop en muestras
  anchor: number; // posición global que corresponde al índice 0
}

/**
 * Looper de N pistas sincronizadas. Sin dependencias del navegador:
 * lo usa el AudioWorklet y se prueba directo.
 */
export class LooperCore {
  readonly states: TrackState[];
  private tracksData: Track[];
  private pos = 0; // posición virtual de reproducción (avanza `rate` por muestra)
  private rate = 1;
  private targetRate = 1;
  private reverse = false;
  private readonly rateCoef: number;
  private base: number | null = null;
  private readonly max: number;
  private readonly latency: number;

  constructor(sampleRate: number, opts: LooperOptions = {}) {
    const { maxSeconds = 30, latencySamples = 0, tracks = 4, smoothing = true } = opts;
    this.rateCoef = smoothing ? 1 - Math.exp(-1 / (0.005 * sampleRate)) : 1;
    this.max = Math.round(maxSeconds * sampleRate);
    this.latency = latencySamples;
    this.tracksData = Array.from({ length: tracks }, () => ({
      state: 'empty' as TrackState,
      buf: new Float32Array(this.max),
      start: 0,
      recorded: 0,
      recDir: 1 as 1 | -1,
      last: 0,
      length: 0,
      anchor: 0,
    }));
    this.states = this.tracksData.map((t) => t.state);
  }

  get baseLength(): number | null {
    return this.base;
  }

  /** Velocidad de los loops (ardilla/monstruo): 0.5 a 2. */
  setRate(rate: number): void {
    this.targetRate = Math.min(2, Math.max(0.5, rate));
    if (this.rateCoef === 1) this.rate = this.targetRate;
  }

  setReverse(on: boolean): void {
    this.reverse = on;
  }

  tap(track: number): void {
    const t = this.tracksData[track];
    if (!t) return;
    switch (t.state) {
      case 'empty': {
        const other = this.tracksData.findIndex((o) => o.state === 'recording');
        if (other >= 0) this.close(other);
        t.state = 'recording';
        t.start = this.pos;
        t.recorded = 0;
        t.recDir = this.reverse ? -1 : 1;
        t.last = 0;
        break;
      }
      case 'recording':
        this.close(track);
        break;
      case 'playing':
        t.state = 'muted';
        break;
      case 'muted':
        t.state = 'playing';
        break;
    }
    this.sync();
  }

  clear(track: number): void {
    const t = this.tracksData[track];
    if (!t) return;
    t.state = 'empty';
    t.recorded = 0;
    t.length = 0;
    if (this.tracksData.every((o) => o.state === 'empty')) this.base = null;
    this.sync();
  }

  process(input: Float32Array, output: Float32Array): void {
    output.fill(0);
    for (let i = 0; i < output.length; i++) {
      const p = this.pos;
      for (let k = 0; k < this.tracksData.length; k++) {
        const t = this.tracksData[k];
        if (t.state === 'playing') {
          output[i] += readInterpolated(t.buf, t.length, mod(p - t.anchor, t.length));
        } else if (t.state === 'recording') {
          this.write(t, Math.floor(Math.abs(p - t.start)), input[i] ?? 0);
          if (t.recorded >= this.recordLimit()) this.close(k);
        }
      }
      this.advance();
    }
  }

  /** Graba como cinta: una muestra por posición virtual, rellenando huecos si va rápido. */
  private write(t: Track, idx: number, x: number): void {
    const limit = this.recordLimit();
    if (idx >= limit) idx = limit - 1;
    if (idx >= t.recorded) {
      const from = t.recorded;
      for (let j = from; j < idx; j++) {
        t.buf[j] = t.last + ((x - t.last) * (j - from + 1)) / (idx - from + 1);
      }
      t.recorded = idx + 1;
    }
    t.buf[idx] = x;
    t.last = x;
  }

  private advance(): void {
    if (this.rate !== this.targetRate) {
      this.rate += (this.targetRate - this.rate) * this.rateCoef;
      if (Math.abs(this.targetRate - this.rate) < 1e-4) {
        this.rate = this.targetRate;
        if (this.rate === 1) this.pos = Math.round(this.pos); // vuelve a leer muestras exactas
      }
    }
    this.pos += this.reverse ? -this.rate : this.rate;
  }

  private recordLimit(): number {
    return this.base === null ? this.max : Math.floor(this.max / this.base) * this.base;
  }

  private close(track: number): void {
    const t = this.tracksData[track];
    let n = Math.min(this.recordLimit(), Math.max(t.recorded, Math.floor(Math.abs(this.pos - t.start))));
    if (t.recorded === 0) n = 0;
    t.buf.fill(t.last, t.recorded, n);
    t.recorded = n;
    if (n === 0) {
      t.state = 'empty';
      if (this.tracksData.every((o) => o.state === 'empty')) this.base = null;
      this.sync();
      return;
    }
    if (this.base === null) {
      this.base = n;
      t.length = n;
    } else {
      t.length = Math.min(Math.ceil(n / this.base) * this.base, this.recordLimit());
      t.buf.fill(0, n, t.length);
    }
    // Lo grabado al revés se voltea para que el índice 0 sea la posición virtual más baja.
    let first = t.start;
    if (t.recDir === -1) {
      t.buf.subarray(0, n).reverse();
      first = t.start - (n - 1);
    }
    const dir = this.reverse ? -1 : 1;
    t.anchor = first - this.latency * this.rate * dir;
    t.state = 'playing';
    this.sync();
  }

  private sync(): void {
    this.tracksData.forEach((t, i) => (this.states[i] = t.state));
  }
}

function readInterpolated(buf: Float32Array, length: number, idx: number): number {
  let i0 = Math.floor(idx);
  if (i0 >= length) i0 = 0; // redondeo de punto flotante en el borde
  const frac = idx - i0;
  if (frac === 0) return buf[i0];
  const i1 = i0 + 1 === length ? 0 : i0 + 1;
  return buf[i0] * (1 - frac) + buf[i1] * frac;
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
