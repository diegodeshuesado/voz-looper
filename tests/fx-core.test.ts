import { describe, expect, test } from 'vitest';
import { FxCore } from '../src/fx/fx-core';

const SR = 48000;
const signal = (n: number) => Float32Array.from({ length: n }, (_, i) => 0.8 * Math.sin(i / 7));
function proc(fx: FxCore, input: Float32Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 128) {
    fx.process(input.subarray(i, i + 128), out.subarray(i, i + 128));
  }
  return out;
}

describe('FxCore', () => {
  test('en reposo deja pasar la señal idéntica', () => {
    const fx = new FxCore(SR);
    const x = signal(1024);
    expect(Array.from(proc(fx, x))).toEqual(Array.from(x));
  });

  test('robot al máximo cambia la señal', () => {
    const fx = new FxCore(SR);
    fx.setRobot(1);
    const x = signal(4800);
    const y = proc(fx, x);
    const diff = y.reduce((acc, v, i) => acc + Math.abs(v - x[i]), 0) / y.length;
    expect(diff).toBeGreaterThan(0.1);
  });

  test('lo-fi al máximo cuantiza a pocos niveles', () => {
    const fx = new FxCore(SR);
    fx.setLofi(1);
    const y = proc(fx, signal(4800));
    expect(new Set(Array.from(y)).size).toBeLessThanOrEqual(16);
  });

  test('stutter repite el último fragmento y al soltarlo vuelve la señal en vivo', () => {
    const fx = new FxCore(SR);
    const ramp = Float32Array.from({ length: 1024 }, (_, i) => i / 1024);
    proc(fx, ramp);
    fx.setStutter(true, 256);
    const y = proc(fx, new Float32Array(1024)); // entrada en silencio
    expect(Array.from(y.subarray(0, 256))).toEqual(Array.from(ramp.subarray(768, 1024)));
    expect(Array.from(y.subarray(256, 512))).toEqual(Array.from(ramp.subarray(768, 1024)));
    fx.setStutter(false, 256);
    const live = Float32Array.from({ length: 128 }, () => 0.3);
    expect(Array.from(proc(fx, live)).every((v) => Math.abs(v - 0.3) < 1e-6)).toBe(true);
  });
});
