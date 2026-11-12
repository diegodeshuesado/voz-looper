type N = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
export type ControlId = `pad${N}` | `knob${N}`;
export type MidiKey = `note:${number}` | `cc:${number}`;
export type MidiEvent = { kind: 'noteOn' | 'noteOff' | 'cc'; number: number; value: number };
export type Mapping = Partial<Record<MidiKey, ControlId>>;

const STORAGE_KEY = 'vozlooper.mapping';

export function parseMidi(data: Uint8Array): MidiEvent | null {
  if (data.length < 3) return null;
  const type = data[0] & 0xf0;
  const number = data[1];
  const value = data[2];
  if (type === 0x90) return { kind: value === 0 ? 'noteOff' : 'noteOn', number, value };
  if (type === 0x80) return { kind: 'noteOff', number, value };
  if (type === 0xb0) return { kind: 'cc', number, value };
  return null;
}

export function keyOf(e: MidiEvent): MidiKey {
  return e.kind === 'cc' ? `cc:${e.number}` : `note:${e.number}`;
}

/** Pads: notas 36–43. Perillas: CC 1–8 (LPD8) y CC 70–77 (LPD8 MK2). */
export const DEFAULT_MAPPING: Mapping = (() => {
  const m: Mapping = {};
  for (let i = 0; i < 8; i++) {
    const n = (i + 1) as N;
    m[`note:${36 + i}`] = `pad${n}`;
    m[`cc:${1 + i}`] = `knob${n}`;
    m[`cc:${70 + i}`] = `knob${n}`;
  }
  return m;
})();

export function learn(m: Mapping, key: MidiKey, control: ControlId): Mapping {
  const next: Mapping = {};
  for (const [k, c] of Object.entries(m) as [MidiKey, ControlId][]) {
    if (c !== control) next[k] = c;
  }
  next[key] = control;
  return next;
}

export function loadMapping(storage: Pick<Storage, 'getItem'> | null): Mapping {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_MAPPING;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Mapping) : DEFAULT_MAPPING;
  } catch {
    return DEFAULT_MAPPING;
  }
}

export function saveMapping(storage: Pick<Storage, 'setItem'> | null, m: Mapping): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(m));
  } catch {
    // almacenamiento bloqueado: la asignación dura solo esta sesión
  }
}
