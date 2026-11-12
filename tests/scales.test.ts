import { expect, test } from 'vitest';
import { hzToMidi, midiToHz, nearestInScale, noteName, padNote, SCALES } from '../src/autotune/scales';

test('Hz y notas MIDI', () => {
  expect(hzToMidi(440)).toBeCloseTo(69);
  expect(midiToHz(60)).toBeCloseTo(261.63, 1);
  expect(noteName(69)).toBe('La 4');
  expect(noteName(61)).toBe('Do♯ 4');
});

test('nota más cercana de la escala', () => {
  expect(nearestInScale(61, 0, SCALES.mayor)).toBe(60); // empate: hacia abajo
  expect(nearestInScale(64.4, 0, SCALES.mayor)).toBe(64);
  expect(nearestInScale(65.6, 0, SCALES.mayor)).toBe(65);
  expect(nearestInScale(66.4, 0, SCALES.mayor)).toBe(67);
  expect(nearestInScale(70, 9, SCALES.menor)).toBe(69); // La menor: Si♭ → La
  expect(nearestInScale(61.2, 0, SCALES.cromatica)).toBe(61);
});

test('notas de los pads', () => {
  expect(padNote(0, 0, SCALES.mayor, 60)).toBe(60);
  expect(padNote(7, 0, SCALES.mayor, 60)).toBe(72);
  expect(padNote(4, 0, SCALES.mayor, 50)).toBe(55);
  expect(padNote(5, 9, SCALES.pentatonica, 57)).toBe(69); // 6º grado de pentatónica = siguiente octava
});
