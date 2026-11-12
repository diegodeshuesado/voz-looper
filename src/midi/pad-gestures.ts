import type { Gesture } from '../controls';

/** Distingue toque (inmediato) de mantener presionado `holdMs`. */
export class PadGestures {
  private timers = new Map<number, ReturnType<typeof setTimeout>>();

  constructor(
    private onGesture: (pad: number, g: Gesture) => void,
    private holdMs = 1000,
  ) {}

  down(pad: number): void {
    if (this.timers.has(pad)) return;
    this.onGesture(pad, 'tap');
    this.timers.set(
      pad,
      setTimeout(() => this.onGesture(pad, 'hold'), this.holdMs),
    );
  }

  up(pad: number): void {
    const t = this.timers.get(pad);
    if (t === undefined) return;
    clearTimeout(t);
    this.timers.delete(pad);
    this.onGesture(pad, 'release');
  }
}
