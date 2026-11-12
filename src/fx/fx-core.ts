/** Stutter → robot → lo-fi, muestra por muestra. Sin dependencias del navegador. */
export class FxCore {
  private history: Float32Array;
  private hPos = 0;
  private frag: Float32Array;
  private fragLen = 0;
  private fragPos = 0;
  private stutter = false;

  private robotTarget = 0;
  private robot = 0;
  private phase = 0;
  private readonly coef: number;

  private lofi = 0;
  private held = 0;
  private holdCount = 0;

  constructor(private sampleRate: number) {
    this.history = new Float32Array(sampleRate * 2);
    this.frag = new Float32Array(sampleRate * 2);
    this.coef = 1 - Math.exp(-1 / (0.005 * sampleRate)); // ~20 ms
  }

  setRobot(amount: number): void {
    this.robotTarget = clamp01(amount);
  }

  setLofi(amount: number): void {
    this.lofi = clamp01(amount);
  }

  setStutter(on: boolean, fragmentSamples: number): void {
    if (on && !this.stutter) {
      const n = Math.max(1, Math.min(Math.round(fragmentSamples), this.history.length));
      const L = this.history.length;
      for (let i = 0; i < n; i++) this.frag[i] = this.history[(this.hPos - n + i + L) % L];
      this.fragLen = n;
      this.fragPos = 0;
    }
    this.stutter = on;
  }

  process(input: Float32Array, output: Float32Array): void {
    const L = this.history.length;
    for (let i = 0; i < output.length; i++) {
      let x = input[i] ?? 0;
      this.history[this.hPos] = x;
      this.hPos = (this.hPos + 1) % L;

      if (this.stutter) {
        x = this.frag[this.fragPos];
        this.fragPos = (this.fragPos + 1) % this.fragLen;
      }

      this.robot += (this.robotTarget - this.robot) * this.coef;
      if (this.robot < 1e-5 && this.robotTarget === 0) this.robot = 0;
      if (this.robot > 0) {
        const freq = 30 + 270 * this.robot;
        this.phase += (2 * Math.PI * freq) / this.sampleRate;
        if (this.phase > 2 * Math.PI) this.phase -= 2 * Math.PI;
        x = x * (1 - this.robot) + x * Math.sin(this.phase) * this.robot;
      }

      if (this.lofi > 0) {
        const hold = 1 + Math.floor(15 * this.lofi);
        if (this.holdCount <= 0) {
          const levels = 2 ** (15 - 12 * this.lofi);
          this.held = Math.round(x * levels) / levels;
          this.holdCount = hold;
        }
        this.holdCount--;
        x = this.held;
      }

      output[i] = x;
    }
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}
