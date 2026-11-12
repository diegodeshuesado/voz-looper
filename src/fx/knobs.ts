// Convierte la posición de cada perilla (0..1) en parámetros de efecto.

const DEAD = 0.04; // zona muerta alrededor del centro

/** Ardilla/monstruo: centro = normal; izquierda hasta 0.25×, derecha hasta 4× (dos octavas). */
export function ardillaRate(v: number): number {
  if (Math.abs(v - 0.5) <= DEAD) return 1;
  const t = v > 0.5 ? (v - 0.5 - DEAD) / (0.5 - DEAD) : (v - 0.5 + DEAD) / (0.5 - DEAD);
  return 4 ** t;
}

/**
 * Filtro: izquierda "bajo el agua" (pasa-bajos hasta 200 Hz), derecha "teléfono" (1.2–2.4 kHz).
 * La resonancia (q) sube hacia los extremos para que se note más.
 */
export function filterParams(v: number): { hp: number; lp: number; q: number } {
  if (Math.abs(v - 0.5) <= DEAD) return { hp: 20, lp: 20000, q: 0.707 };
  const t = Math.abs(v - 0.5) - DEAD;
  const k = Math.min(1, t / (0.5 - DEAD));
  const q = Math.round((0.707 + (6 - 0.707) * k) * 1000) / 1000;
  if (v < 0.5) return { hp: 20, lp: Math.round(20000 * (200 / 20000) ** k), q };
  return { hp: Math.round(20 * (1200 / 20) ** k), lp: Math.round(20000 * (2400 / 20000) ** k), q };
}

/** Reverb: al subir, entra mucha reverb y baja el sonido directo. */
export function reverbParams(v: number): { wet: number; dry: number } {
  return { wet: 1.6 * v, dry: 1 - 0.6 * v };
}

/** Eco: más perilla = más volumen y más repeticiones. */
export function echoParams(v: number): { wet: number; feedback: number } {
  return { wet: 0.9 * v, feedback: 0.75 * v };
}

/** Tamaño del fragmento del stutter: 1/16 de la duración base, o 125 ms sin loops. */
export function stutterSamples(sampleRate: number, base: number | null): number {
  return base ? Math.round(base / 16) : Math.round(0.125 * sampleRate);
}
