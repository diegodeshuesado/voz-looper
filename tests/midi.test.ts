import { expect, test } from 'vitest';
import { startMidi, type MidiStatus } from '../src/midi/midi';
import { DEFAULT_MAPPING } from '../src/midi/mapping';

type FakeInput = { name: string; onmidimessage: ((e: { data: Uint8Array }) => void) | null };

function fakeAccess() {
  const inputs = new Map<string, FakeInput>();
  const access = { inputs, onstatechange: null as null | (() => void) };
  return access;
}

function recorder() {
  const controls: string[] = [];
  const raw: string[] = [];
  const status: [MidiStatus, string | undefined][] = [];
  return {
    controls, raw, status,
    h: {
      onControl: (c: string) => controls.push(c),
      onRaw: (k: string) => raw.push(k),
      onStatus: (s: MidiStatus, n?: string) => status.push([s, n]),
    },
  };
}

test('sin Web MIDI reporta unsupported', async () => {
  const r = recorder();
  await startMidi(() => DEFAULT_MAPPING, r.h, {});
  expect(r.status).toEqual([['unsupported', undefined]]);
});

test('permiso negado reporta denied', async () => {
  const r = recorder();
  await startMidi(() => DEFAULT_MAPPING, r.h, { requestMIDIAccess: () => Promise.reject(new Error('no')) });
  expect(r.status.at(-1)?.[0]).toBe('denied');
});

test('mensajes de una entrada llegan como controles', async () => {
  const access = fakeAccess();
  const lpd: FakeInput = { name: 'LPD8', onmidimessage: null };
  access.inputs.set('a', lpd);
  const r = recorder();
  await startMidi(() => DEFAULT_MAPPING, r.h, { requestMIDIAccess: () => Promise.resolve(access as unknown as MIDIAccess) });
  expect(r.status.at(-1)).toEqual(['connected', 'LPD8']);
  lpd.onmidimessage!({ data: new Uint8Array([0x90, 36, 100]) });
  expect(r.controls).toEqual(['pad1']);
  expect(r.raw).toEqual(['note:36']);
});

test('mensaje sin asignación solo va al monitor', async () => {
  const access = fakeAccess();
  const lpd: FakeInput = { name: 'LPD8', onmidimessage: null };
  access.inputs.set('a', lpd);
  const r = recorder();
  await startMidi(() => DEFAULT_MAPPING, r.h, { requestMIDIAccess: () => Promise.resolve(access as unknown as MIDIAccess) });
  lpd.onmidimessage!({ data: new Uint8Array([0x90, 99, 100]) });
  expect(r.controls).toEqual([]);
  expect(r.raw).toEqual(['note:99']);
});

test('desconectar y reconectar en caliente', async () => {
  const access = fakeAccess();
  access.inputs.set('a', { name: 'LPD8', onmidimessage: null });
  const r = recorder();
  await startMidi(() => DEFAULT_MAPPING, r.h, { requestMIDIAccess: () => Promise.resolve(access as unknown as MIDIAccess) });
  access.inputs.delete('a');
  access.onstatechange!();
  expect(r.status.at(-1)?.[0]).toBe('disconnected');
  const again: FakeInput = { name: 'LPD8 mk2', onmidimessage: null };
  access.inputs.set('b', again);
  access.onstatechange!();
  expect(r.status.at(-1)).toEqual(['connected', 'LPD8 mk2']);
  again.onmidimessage!({ data: new Uint8Array([0xb0, 77, 127]) });
  expect(r.controls).toEqual(['knob8']);
});

test('puerto que queda en la lista como disconnected cuenta como desconectado', async () => {
  const access = fakeAccess();
  const lpd = { name: 'LPD8', state: 'connected', onmidimessage: null } as FakeInput & { state: string };
  access.inputs.set('a', lpd);
  const r = recorder();
  await startMidi(() => DEFAULT_MAPPING, r.h, { requestMIDIAccess: () => Promise.resolve(access as unknown as MIDIAccess) });
  expect(r.status.at(-1)?.[0]).toBe('connected');
  lpd.state = 'disconnected';
  access.onstatechange!();
  expect(r.status.at(-1)?.[0]).toBe('disconnected');
});
