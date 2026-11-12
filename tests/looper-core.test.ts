import { describe, expect, test } from 'vitest';
import { LooperCore } from '../src/looper/looper-core';

const SR = 100; // 30 s = 3000 muestras

/** Procesa `samples` en bloques de 128 y devuelve la salida. */
function run(core: LooperCore, samples: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < samples.length; i += 128) {
    const chunk = samples.slice(i, i + 128);
    const input = Float32Array.from(chunk);
    const output = new Float32Array(chunk.length);
    core.process(input, output);
    out.push(...output);
  }
  return out;
}
const fill = (n: number, v: number) => new Array<number>(n).fill(v);

describe('LooperCore', () => {
  test('primer loop fija la base', () => {
    const core = new LooperCore(SR);
    core.tap(0);
    run(core, fill(1000, 0.5));
    core.tap(0);
    expect(core.baseLength).toBe(1000);
    expect(core.states[0]).toBe('playing');
    const out = run(core, fill(1000, 0));
    expect(out.every((v) => v === 0.5)).toBe(true);
  });

  test('loop siguiente se redondea a múltiplo de la base', () => {
    const core = new LooperCore(SR);
    core.tap(0);
    run(core, fill(1000, 0.25));
    core.tap(0);
    core.tap(1);
    run(core, fill(1500, 0.5));
    core.tap(1);
    // La pista 1 dura 2000 y quedó anclada donde empezó a grabar.
    // Tras grabar 1500, la pista 1 está en el índice 1500: suenan 500 de silencio y luego 1500 grabadas.
    const out = run(core, fill(2000, 0));
    expect(out.slice(0, 500).every((v) => v === 0.25)).toBe(true);
    expect(out.slice(500, 2000).every((v) => v === 0.75)).toBe(true);
  });

  test('silenciar y volver', () => {
    const core = new LooperCore(SR);
    core.tap(0);
    run(core, fill(200, 0.5));
    core.tap(0);
    core.tap(0);
    expect(core.states[0]).toBe('muted');
    expect(run(core, fill(200, 0)).every((v) => v === 0)).toBe(true);
    core.tap(0);
    expect(run(core, fill(200, 0)).every((v) => v === 0.5)).toBe(true);
  });

  test('mantener borra y olvida la base', () => {
    const core = new LooperCore(SR);
    core.tap(0);
    run(core, fill(200, 0.5));
    core.tap(0);
    core.clear(0);
    expect(core.states[0]).toBe('empty');
    expect(core.baseLength).toBeNull();
    expect(run(core, fill(200, 0)).every((v) => v === 0)).toBe(true);
  });

  test('toque-toque sin muestras vuelve a vacío', () => {
    const core = new LooperCore(SR);
    core.tap(0);
    core.tap(0);
    expect(core.states[0]).toBe('empty');
    expect(core.baseLength).toBeNull();
  });

  test('tocar otra pista mientras graba cierra la primera', () => {
    const core = new LooperCore(SR);
    core.tap(0);
    run(core, fill(500, 0.5));
    core.tap(1);
    expect(core.states.slice(0, 2)).toEqual(['playing', 'recording']);
    expect(core.baseLength).toBe(500);
  });

  test('auto-cierre a 30 s', () => {
    const core = new LooperCore(SR);
    core.tap(0);
    run(core, fill(3100, 0.5));
    expect(core.states[0]).toBe('playing');
    expect(core.baseLength).toBe(3000);
  });

  test('auto-cierre de pista siguiente', () => {
    const core = new LooperCore(SR);
    core.tap(0);
    run(core, fill(1000, 0.1));
    core.tap(0);
    core.tap(1);
    run(core, fill(3100, 0.5));
    expect(core.states[1]).toBe('playing');
  });

  test('compensa latencia', () => {
    const core = new LooperCore(SR, { latencySamples: 10 });
    run(core, fill(37, 0)); // pos = 37
    core.tap(0); // start = 37
    run(core, [1, ...fill(99, 0)]);
    core.tap(0); // pos = 137, base 100
    const out = run(core, fill(200, 0)); // out[k] es pos 137 + k
    const hit = out.findIndex((v) => v === 1);
    // Sin compensación caería en 237 (37 + 2·100); con latencia 10 cae 10 muestras antes.
    expect(137 + hit).toBe(37 + 200 - 10);
  });

  test('al revés reproduce el loop invertido', () => {
    const core = new LooperCore(SR);
    core.tap(0);
    run(core, [1, 2, 3, 4]);
    core.tap(0); // pos 4, idx 0
    core.setReverse(true);
    // Sigue desde donde iba, ahora hacia atrás (sin saltos): 0, 3, 2, 1.
    expect(run(core, fill(4, 0))).toEqual([1, 4, 3, 2]);
  });

  test('velocidad 2 recorre el loop al doble', () => {
    const core = new LooperCore(SR, { smoothing: false });
    core.tap(0);
    run(core, [0, 1, 2, 3, 4, 5, 6, 7]);
    core.tap(0);
    core.setRate(2);
    expect(run(core, fill(4, 0))).toEqual([0, 2, 4, 6]);
  });

  test('velocidad 0.5 interpola entre muestras', () => {
    const core = new LooperCore(SR, { smoothing: false });
    core.tap(0);
    run(core, [0, 2, 4, 6]);
    core.tap(0);
    core.setRate(0.5);
    expect(run(core, fill(4, 0))).toEqual([0, 1, 2, 3]);
  });

  test('velocidad y al revés juntos nunca leen fuera del buffer', () => {
    const core = new LooperCore(SR);
    core.tap(0);
    run(core, Array.from({ length: 333 }, (_, i) => Math.sin(i)));
    core.tap(0);
    core.setReverse(true);
    for (const r of [0.5, 0.73, 1.9, 2]) {
      core.setRate(r);
      const out = run(core, fill(1000, 0));
      expect(out.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)).toBe(true);
    }
  });

  test('al revés mantiene sincronizados los loops encimados', () => {
    const core = new LooperCore(SR, { smoothing: false });
    core.tap(0);
    run(core, [0, 0, 0, 0, 0, 0.5, 0, 0]); // impulso en el índice 5
    core.tap(0); // pos 8
    run(core, [0, 0, 0]); // pos 11
    core.tap(1);
    run(core, [0, 0, 0.25, 0, 0, 0, 0, 0]); // el 0.25 cae junto al 0.5 (pos 13)
    core.tap(1);
    core.setReverse(true);
    const out = run(core, fill(16, 0)).filter((v) => v !== 0);
    expect(out).toEqual([0.75, 0.75]);
  });

  test('grabar con velocidad 2 queda sincronizado al volver a velocidad normal', () => {
    const core = new LooperCore(SR, { smoothing: false });
    const base = fill(16, 0);
    base[8] = 0.5;
    core.tap(0);
    run(core, base);
    core.tap(0); // pos 16
    core.setRate(2);
    core.tap(1);
    const sung = fill(8, 0);
    sung[4] = 0.25; // se oye el impulso base 4 muestras reales después (pos virtual 24)
    run(core, sung); // 8 muestras reales = 16 virtuales
    core.tap(1);
    core.setRate(1);
    // A doble velocidad la grabación se estira (como cinta): lo que importa es que el golpe
    // cantado caiga encima del golpe del loop base.
    const out = run(core, fill(32, 0));
    expect(Math.max(...out)).toBeCloseTo(0.75);
  });

  test('tras volver al centro la velocidad queda exactamente en 1 y sin interpolar', () => {
    const core = new LooperCore(SR);
    core.tap(0);
    run(core, [0.1, 0.2, 0.3, 0.4]);
    core.tap(0);
    core.setRate(1.37);
    run(core, fill(50, 0));
    core.setRate(1);
    run(core, fill(500, 0));
    const out = run(core, fill(4, 0));
    expect(out.every((v) => [0.1, 0.2, 0.3, 0.4].some((x) => Math.abs(x - v) < 1e-7))).toBe(true);
  });

  test('grabar al revés queda sincronizado al volver hacia adelante', () => {
    const core = new LooperCore(SR, { smoothing: false });
    core.tap(0);
    run(core, [0, 0, 0, 0, 0, 0.5, 0, 0]);
    core.tap(0); // pos 8 ≡ 0
    core.setReverse(true);
    core.tap(1); // pos baja: 8, 7, 6, 5 ...
    run(core, [0, 0, 0, 0.25, 0, 0, 0, 0]); // la 4ª muestra real es pos 5: el golpe del loop base
    core.tap(1);
    core.setReverse(false);
    const out = run(core, fill(16, 0)).filter((v) => v !== 0);
    expect(out).toEqual([0.75, 0.75]);
  });
});
