export type TrackState = 'empty' | 'recording' | 'playing' | 'muted';

export interface LooperOptions {
  maxSeconds?: number;
  latencySamples?: number;
  tracks?: number;
}

interface Track {
  state: TrackState;
  buf: Float32Array;
  start: number; // posición global donde empezó a grabar
  recorded: number; // muestras grabadas
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
  private pos = 0;
  private base: number | null = null;
  private readonly max: number;
  private readonly latency: number;

  constructor(sampleRate: number, opts: LooperOptions = {}) {
    const { maxSeconds = 30, latencySamples = 0, tracks = 4 } = opts;
    this.max = Math.round(maxSeconds * sampleRate);
    this.latency = latencySamples;
    this.tracksData = Array.from({ length: tracks }, () => ({
      state: 'empty' as TrackState,
      buf: new Float32Array(this.max),
      start: 0,
      recorded: 0,
      length: 0,
      anchor: 0,
    }));
    this.states = this.tracksData.map((t) => t.state);
  }

  get baseLength(): number | null {
    return this.base;
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
      const p = this.pos + i;
      for (let k = 0; k < this.tracksData.length; k++) {
        const t = this.tracksData[k];
        if (t.state === 'playing') {
          output[i] += t.buf[mod(p - t.anchor, t.length)];
        } else if (t.state === 'recording') {
          t.buf[t.recorded++] = input[i] ?? 0;
          if (t.recorded >= this.recordLimit()) this.close(k);
        }
      }
    }
    this.pos += output.length;
  }

  private recordLimit(): number {
    return this.base === null ? this.max : Math.floor(this.max / this.base) * this.base;
  }

  private close(track: number): void {
    const t = this.tracksData[track];
    const n = t.recorded;
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
    t.anchor = t.start - this.latency;
    t.state = 'playing';
    this.sync();
  }

  private sync(): void {
    this.tracksData.forEach((t, i) => (this.states[i] = t.state));
  }
}

function mod(a: number, n: number): number {
  return ((a % n) + n) % n;
}
