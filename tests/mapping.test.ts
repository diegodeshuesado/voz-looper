import { describe, expect, test } from 'vitest';
import { DEFAULT_MAPPING, keyOf, learn, loadMapping, parseMidi, saveMapping } from '../src/midi/mapping';
import { padAction } from '../src/controls';

describe('parseMidi', () => {
  test('note on', () => {
    expect(parseMidi(new Uint8Array([0x90, 36, 100]))).toEqual({ kind: 'noteOn', number: 36, value: 100 });
  });
  test('note on con velocidad 0 es note off (cualquier canal)', () => {
    expect(parseMidi(new Uint8Array([0x99, 40, 0]))).toEqual({ kind: 'noteOff', number: 40, value: 0 });
  });
  test('note off', () => {
    expect(parseMidi(new Uint8Array([0x80, 36, 0]))?.kind).toBe('noteOff');
  });
  test('control change', () => {
    expect(parseMidi(new Uint8Array([0xb0, 70, 64]))).toEqual({ kind: 'cc', number: 70, value: 64 });
  });
  test('otros mensajes se ignoran', () => {
    expect(parseMidi(new Uint8Array([0xf8]))).toBeNull();
  });
  test('keyOf', () => {
    expect(keyOf({ kind: 'noteOff', number: 36, value: 0 })).toBe('note:36');
    expect(keyOf({ kind: 'cc', number: 3, value: 0 })).toBe('cc:3');
  });
});

describe('mapeo', () => {
  test('de fábrica cubre LPD8 y LPD8 MK2', () => {
    expect(DEFAULT_MAPPING['note:36']).toBe('pad1');
    expect(DEFAULT_MAPPING['note:43']).toBe('pad8');
    expect(DEFAULT_MAPPING['cc:1']).toBe('knob1');
    expect(DEFAULT_MAPPING['cc:77']).toBe('knob8');
  });
  test('aprender reemplaza la asignación anterior del control', () => {
    const m = learn(DEFAULT_MAPPING, 'note:60', 'pad1');
    expect(m['note:60']).toBe('pad1');
    expect(m['note:36']).toBeUndefined();
    expect(DEFAULT_MAPPING['note:36']).toBe('pad1'); // no muta el original
  });
  test('sin almacenamiento o con error usa el de fábrica', () => {
    expect(loadMapping(null)).toEqual(DEFAULT_MAPPING);
    expect(loadMapping({ getItem: () => { throw new Error('bloqueado'); } })).toEqual(DEFAULT_MAPPING);
    expect(loadMapping({ getItem: () => '{no es json' })).toEqual(DEFAULT_MAPPING);
    expect(() => saveMapping({ setItem: () => { throw new Error('bloqueado'); } }, DEFAULT_MAPPING)).not.toThrow();
  });
  test('guarda y vuelve a cargar', () => {
    const store = new Map<string, string>();
    const m = learn(DEFAULT_MAPPING, 'cc:20', 'knob2');
    saveMapping({ setItem: (k, v) => store.set(k, v) }, m);
    expect(loadMapping({ getItem: (k) => store.get(k) ?? null })).toEqual(m);
  });
});

describe('padAction', () => {
  test('pads 1-4 son loops', () => {
    expect(padAction(0, 'tap')).toEqual({ type: 'loopTap', track: 0 });
    expect(padAction(0, 'hold')).toEqual({ type: 'loopHold', track: 0 });
    expect(padAction(3, 'release')).toBeNull();
  });
  test('pads 5-8', () => {
    expect(padAction(4, 'tap')).toEqual({ type: 'toggleReverse' });
    expect(padAction(4, 'release')).toBeNull();
    expect(padAction(5, 'tap')).toEqual({ type: 'stutter', on: true });
    expect(padAction(5, 'release')).toEqual({ type: 'stutter', on: false });
    expect(padAction(6, 'tap')).toEqual({ type: 'toggleAutotune' });
    expect(padAction(7, 'tap')).toEqual({ type: 'toggleMic' });
    expect(padAction(7, 'hold')).toBeNull();
  });
});
