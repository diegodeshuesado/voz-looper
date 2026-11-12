import { expect, test } from 'vitest';
import { ardillaRate, echoParams, filterParams, stutterSamples } from '../src/fx/knobs';

test('ardilla: centro normal, extremos media y doble velocidad', () => {
  expect(ardillaRate(0.5)).toBe(1);
  expect(ardillaRate(0.53)).toBe(1); // zona muerta
  expect(ardillaRate(0)).toBeCloseTo(0.5);
  expect(ardillaRate(1)).toBeCloseTo(2);
  expect(ardillaRate(0.75)).toBeGreaterThan(1);
});

test('filtro: centro sin filtro, izquierda bajo el agua, derecha teléfono', () => {
  expect(filterParams(0.5)).toEqual({ hp: 20, lp: 20000 });
  expect(filterParams(0)).toEqual({ hp: 20, lp: 300 });
  const tel = filterParams(1);
  expect(tel.hp).toBeCloseTo(1000);
  expect(tel.lp).toBeCloseTo(3000);
});

test('eco', () => {
  expect(echoParams(0)).toEqual({ wet: 0, feedback: 0 });
  expect(echoParams(1)).toEqual({ wet: 1, feedback: 0.6 });
});

test('stutter: 1/16 de la base o 125 ms', () => {
  expect(stutterSamples(48000, null)).toBe(6000);
  expect(stutterSamples(48000, 96000)).toBe(6000);
  expect(stutterSamples(48000, 160000)).toBe(10000);
});
