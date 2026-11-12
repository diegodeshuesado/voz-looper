import { expect, test } from 'vitest';
import { detectPitch } from '../src/autotune/yin';

const SR = 24000;
const sine = (hz: number, n = 1024) => Float32Array.from({ length: n }, (_, i) => 0.6 * Math.sin((2 * Math.PI * hz * i) / SR));

test.each([110, 220, 440, 880])('detecta %i Hz', (hz) => {
  const got = detectPitch(sine(hz), SR);
  expect(got).not.toBeNull();
  expect(Math.abs(got! - hz) / hz).toBeLessThan(0.01);
});

test('voz con armónicos: detecta la fundamental', () => {
  const buf = Float32Array.from({ length: 1024 }, (_, i) => {
    const t = (2 * Math.PI * 150 * i) / SR;
    return 0.4 * Math.sin(t) + 0.3 * Math.sin(2 * t) + 0.2 * Math.sin(3 * t);
  });
  expect(Math.abs(detectPitch(buf, SR)! - 150)).toBeLessThan(2);
});

test('silencio y ruido: sin nota', () => {
  expect(detectPitch(new Float32Array(1024), SR)).toBeNull();
  let seed = 1;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  expect(detectPitch(Float32Array.from({ length: 1024 }, rand), SR)).toBeNull();
});
