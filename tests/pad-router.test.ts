import { expect, test } from 'vitest';
import { PadRouter } from '../src/midi/pad-router';
import type { Action } from '../src/controls';

function setup() {
  const actions: Action[] = [];
  const pressed: string[] = [];
  const r = new PadRouter((a) => actions.push(a), (pad, on) => pressed.push(`${pad}:${on}`));
  return { r, actions, pressed };
}

test('un pad mantenido conserva el modo con el que se presionó', () => {
  const { r, actions } = setup();
  r.gesture(5, 'tap'); // stutter on
  r.setNoteMode(true);
  r.gesture(5, 'release');
  expect(actions).toEqual([{ type: 'stutter', on: true }, { type: 'stutter', on: false }]);
});

test('mantener una nota y salir del modo notas no borra el loop', () => {
  const { r, actions } = setup();
  r.setNoteMode(true);
  r.gesture(0, 'tap');
  r.setNoteMode(false);
  r.gesture(0, 'hold');
  r.gesture(0, 'release');
  expect(actions).toEqual([{ type: 'notePress', index: 0 }, { type: 'noteRelease', index: 0 }]);
});

test('soltar una nota regresa a la que sigue presionada', () => {
  const { r, actions } = setup();
  r.setNoteMode(true);
  r.gesture(0, 'tap');
  r.gesture(1, 'tap');
  r.gesture(1, 'release');
  expect(actions.at(-1)).toEqual({ type: 'notePress', index: 0 });
  r.gesture(0, 'release');
  expect(actions.at(-1)).toEqual({ type: 'noteRelease', index: 0 });
});

test('modo normal usa las acciones de siempre', () => {
  const { r, actions } = setup();
  r.gesture(0, 'tap');
  r.gesture(0, 'hold');
  expect(actions).toEqual([{ type: 'loopTap', track: 0 }, { type: 'loopHold', track: 0 }]);
});
