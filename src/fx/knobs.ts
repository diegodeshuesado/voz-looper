// Convierte la posición de cada perilla (0..1) en parámetros de efecto.

const DEAD = 0.04; // zona muerta alrededor del centro

/** Ardilla/monstruo: centro = normal; izquierda hasta 0.5×, derecha hasta 2×. */
export function ardillaRate(v: number): number {
  if (Math.abs(v - 0.5) <= DEAD) return 1;
  const t = v > 0.5 ? (v - 0.5 - DEAD) / (0.5 - DEAD) : (v - 0.5 + DEAD) / (0.5 - DEAD);
  return 2 ** t;
}

/** Filtro: izquierda "bajo el agua" (pasa-bajos hasta 300 Hz), derecha "teléfono" (1–3 kHz). */
export function filterParams(v: number): { hp: number; lp: number } {
  if (Math.abs(v - 0.5) <= DEAD) return { hp: 20, lp: 20000 };
  if (v < 0.5) {
    const t = (0.5 - DEAD - v) / (0.5 - DEAD);
    return { hp: 20, lp: Math.round(20000 * (300 / 20000) ** t) };
  }
  const t = (v - 0.5 - DEAD) / (0.5 - DEAD);
  return { hp: Math.round(20 * (1000 / 20) ** t), lp: Math.round(20000 * (3000 / 20000) ** t) };
}

/** Eco: más perilla = más volumen y más repeticiones. */
export function echoParams(v: number): { wet: number; feedback: number } {
  return { wet: v, feedback: 0.6 * v };
}

/** Tamaño del fragmento del stutter: 1/16 de la duración base, o 125 ms sin loops. */
export function stutterSamples(sampleRate: number, base: number | null): number {
  return base ? Math.round(base / 16) : Math.round(0.125 * sampleRate);
}
