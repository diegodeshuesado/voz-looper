/** Escalas como semitonos desde la tónica. */
export const SCALES = {
  mayor: [0, 2, 4, 5, 7, 9, 11],
  menor: [0, 2, 3, 5, 7, 8, 10],
  pentatonica: [0, 3, 5, 7, 10],
  cromatica: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
} as const;

export type ScaleName = keyof typeof SCALES;
export type Scale = readonly number[];

export const SCALE_LABELS: Record<ScaleName, string> = {
  mayor: 'Mayor',
  menor: 'Menor',
  pentatonica: 'Pentatónica menor',
  cromatica: 'Cromática',
};

export const NOTE_NAMES = ['Do', 'Do♯', 'Re', 'Re♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];

export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

export function midiToHz(m: number): number {
  return 440 * 2 ** ((m - 69) / 12);
}

export function noteName(m: number): string {
  const n = Math.round(m);
  return `${NOTE_NAMES[((n % 12) + 12) % 12]} ${Math.floor(n / 12) - 1}`;
}

const inScale = (n: number, tonic: number, scale: Scale) => scale.includes((((n - tonic) % 12) + 12) % 12);

/** Nota entera de la escala más cercana a `m` (puede tener decimales). Empates hacia abajo. */
export function nearestInScale(m: number, tonic: number, scale: Scale): number {
  const lo = Math.floor(m);
  let best = lo;
  let bestDist = Infinity;
  for (let n = lo - 6; n <= lo + 7; n++) {
    if (!inScale(n, tonic, scale)) continue;
    const d = Math.abs(n - m);
    if (d < bestDist - 1e-9) {
      best = n;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Nota del pad `i` (0..7): grados de la escala desde la tónica hacia arriba.
 * La octava parte de la tónica más cercana por debajo de la voz (`nearMidi`).
 */
export function padNote(i: number, tonic: number, scale: Scale, nearMidi: number): number {
  const pc = ((tonic % 12) + 12) % 12;
  const base = Math.floor((nearMidi - pc) / 12) * 12 + pc;
  return base + scale[i % scale.length] + 12 * Math.floor(i / scale.length);
}
