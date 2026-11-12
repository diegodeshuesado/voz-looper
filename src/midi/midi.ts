import { keyOf, parseMidi, type ControlId, type Mapping, type MidiEvent, type MidiKey } from './mapping';

export type MidiStatus = 'unsupported' | 'denied' | 'disconnected' | 'connected';

export interface MidiHandlers {
  onControl(control: ControlId, e: MidiEvent): void;
  onRaw(key: MidiKey, e: MidiEvent): void;
  onStatus(status: MidiStatus, deviceName?: string): void;
}

type Nav = { requestMIDIAccess?: () => Promise<MIDIAccess> };

/** Escucha todas las entradas MIDI y se reengancha cuando se conecta o desconecta algo. */
export async function startMidi(
  getMapping: () => Mapping,
  h: MidiHandlers,
  nav: Nav = navigator as unknown as Nav,
): Promise<void> {
  if (typeof nav.requestMIDIAccess !== 'function') {
    h.onStatus('unsupported');
    return;
  }
  let access: MIDIAccess;
  try {
    access = await nav.requestMIDIAccess.call(nav);
  } catch {
    h.onStatus('denied');
    return;
  }

  const onMessage = (ev: { data: Uint8Array | null }) => {
    if (!ev.data) return;
    const e = parseMidi(ev.data);
    if (!e) return;
    const key = keyOf(e);
    h.onRaw(key, e);
    const control = getMapping()[key];
    if (control) h.onControl(control, e);
  };

  const attach = () => {
    let first: string | undefined;
    access.inputs.forEach((input) => {
      input.onmidimessage = onMessage as (ev: MIDIMessageEvent) => void;
      first ??= input.name ?? 'MIDI';
    });
    if (first === undefined) h.onStatus('disconnected');
    else h.onStatus('connected', first);
  };

  access.onstatechange = attach;
  attach();
}
