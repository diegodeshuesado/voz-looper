import { describe, expect, test } from 'vitest';
import { AutotuneCore } from '../src/autotune/autotune-core';
import { SCALES } from '../src/autotune/scales';
import { detectPitch } from '../src/autotune/yin';

const SR = 48000;
const tone = (hz: number, seconds: number) =>
  Float32Array.from({ length: Math.round(SR * seconds) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / SR));

function proc(core: AutotuneCore, input: Float32Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i += 128) core.process(input.subarray(i, i + 128), out.subarray(i, i + 128));
  return out;
}
const pitchOfTail = (y: Float32Array) => detectPitch(y.subarray(y.length - 4096), SR);

describe('AutotuneCore', () => {
  test('afina una voz desafinada a la nota de la escala', () => {
    const core = new AutotuneCore(SR);
    core.setScale(0, SCALES.mayor);
    core.setRetune(1);
    const y = proc(core, tone(452, 1)); // La4 + ~47 cents
    expect(Math.abs(pitchOfTail(y)! - 440) / 440).toBeLessThan(0.01);
    expect(core.detectedMidi).toBeCloseTo(69.47, 0);
  });

  test('apagado deja pasar la voz con un retraso fijo', () => {
    const core = new AutotuneCore(SR);
    core.setEnabled(false);
    const x = tone(300, 0.2);
    const y = proc(core, x);
    const L = core.latencySamples;
    expect(L).toBeGreaterThan(0);
    for (let n = L; n < x.length; n += 97) expect(y[n]).toBeCloseTo(x[n - L], 6);
  });

  test('en modo notas el pad manda la nota', () => {
    const core = new AutotuneCore(SR);
    core.setScale(0, SCALES.mayor);
    core.setRetune(1);
    core.setForcedDegree(2); // Mi
    const y = proc(core, tone(440, 1));
    expect(Math.abs(pitchOfTail(y)! - 329.63) / 329.63).toBeLessThan(0.015);
  });

  test('sin nota clara no inventa nada (silencio sale silencio)', () => {
    const core = new AutotuneCore(SR);
    const y = proc(core, new Float32Array(SR / 2));
    expect(y.every((v) => v === 0)).toBe(true);
    expect(core.detectedMidi).toBeNull();
  });
});

test('autotuneLatency coincide con el núcleo', async () => {
  const { autotuneLatency } = await import('../src/autotune/autotune-core');
  for (const sr of [44100, 48000, 96000]) expect(autotuneLatency(sr)).toBe(new AutotuneCore(sr).latencySamples);
});

test('analiza a ~12 kHz para gastar poco procesador (también a 96 kHz)', () => {
  expect(new AutotuneCore(48000).analysisRate).toBe(12000);
  expect(new AutotuneCore(96000).analysisRate).toBe(12000);
  expect(new AutotuneCore(44100).analysisRate).toBe(11025);
});

test('un instante sin nota clara no suelta la corrección de golpe', () => {
  const core = new AutotuneCore(SR);
  core.setScale(0, SCALES.mayor);
  core.setRetune(1);
  proc(core, tone(452, 0.5));
  const locked = core.currentShift;
  expect(locked).toBeLessThan(-0.3);
  proc(core, new Float32Array(1024)); // ~2 análisis sin nota
  expect(core.currentShift).toBeCloseTo(locked, 2);
});
