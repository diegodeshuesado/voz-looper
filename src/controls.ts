/** Lista central de acciones: el LPD8 y la pantalla llaman a las mismas. */
export type Action =
  | { type: 'loopTap'; track: number }
  | { type: 'loopHold'; track: number }
  | { type: 'toggleMic' }
  | { type: 'toggleReverse' }
  | { type: 'stutter'; on: boolean }
  | { type: 'toggleAutotune' }
  | { type: 'knob'; index: number; value: number }; // index 0..7, value 0..1

export type Dispatch = (a: Action) => void;
export type Gesture = 'tap' | 'hold' | 'release';

/** Traduce un gesto en un pad (0..7) a su acción, o null si no hace nada. */
export function padAction(pad: number, gesture: Gesture): Action | null {
  if (pad >= 0 && pad <= 3) {
    if (gesture === 'tap') return { type: 'loopTap', track: pad };
    if (gesture === 'hold') return { type: 'loopHold', track: pad };
    return null;
  }
  if (pad === 5) {
    if (gesture === 'tap') return { type: 'stutter', on: true };
    if (gesture === 'release') return { type: 'stutter', on: false };
    return null;
  }
  if (gesture !== 'tap') return null;
  if (pad === 4) return { type: 'toggleReverse' };
  if (pad === 6) return { type: 'toggleAutotune' };
  if (pad === 7) return { type: 'toggleMic' };
  return null;
}
