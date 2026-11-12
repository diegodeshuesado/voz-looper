/**
 * Detección de tono YIN. Usa la primera mitad de `buf` como ventana.
 * Devuelve la frecuencia en Hz, o null si no hay una nota clara (silencio, ruido, consonantes).
 * `scratch` evita crear arreglos en el hilo de audio.
 */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number,
  minHz = 70,
  maxHz = 1000,
  threshold = 0.15,
  scratch?: Float32Array,
): number | null {
  const W = Math.floor(buf.length / 2);
  const tauMin = Math.max(2, Math.floor(sampleRate / maxHz));
  const tauMax = Math.min(W - 1, Math.ceil(sampleRate / minHz));
  if (tauMax <= tauMin) return null;

  let energy = 0;
  for (let j = 0; j < W; j++) energy += buf[j] * buf[j];
  if (Math.sqrt(energy / W) < 0.01) return null;

  const d = scratch && scratch.length > tauMax ? scratch : new Float32Array(tauMax + 1);
  // Diferencia acumulada normalizada (CMNDF).
  d[0] = 1;
  let running = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let sum = 0;
    for (let j = 0; j < W; j++) {
      const diff = buf[j] - buf[j + tau];
      sum += diff * diff;
    }
    running += sum;
    d[tau] = running > 0 ? (sum * tau) / running : 1;
  }

  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < threshold) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return null;

  // Interpolación parabólica para afinar el periodo.
  let better = tau;
  if (tau > 1 && tau < tauMax) {
    const a = d[tau - 1];
    const b = d[tau];
    const c = d[tau + 1];
    const den = a + c - 2 * b;
    if (den !== 0) better = tau + (a - c) / (2 * den);
  }
  const hz = sampleRate / better;
  return hz >= minHz && hz <= maxHz ? hz : null;
}
