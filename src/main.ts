import './style.css';
import { Engine, type MicError } from './audio/engine';
import type { Action } from './controls';
import { learn, loadMapping, saveMapping, type ControlId } from './midi/mapping';
import { startMidi } from './midi/midi';
import { PadGestures } from './midi/pad-gestures';
import { PadRouter } from './midi/pad-router';
import { mountUi } from './ui/ui';

const storage = (() => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();

const MIC_ERRORS: Record<MicError, string> = {
  'mic-denied': 'No hay permiso para el micrófono. Permítelo en el candado de la barra de direcciones y recarga la página.',
  'mic-missing': 'No se encontró ningún micrófono. Conecta uno y recarga la página.',
  'mic-busy': 'El micrófono está ocupado por otro programa. Ciérralo y recarga la página.',
  insecure: 'El micrófono solo funciona en páginas seguras (https).',
};

let refreshMics: () => Promise<void> = async () => {};

let mapping = loadMapping(storage);
let engine: Engine | null = null;
let learnTarget: ControlId | null = null;
let skipNextControl = false;

const dispatch = (a: Action) => engine?.handle(a);
const router = new PadRouter(dispatch, (pad, on) => ui.setNotePressed(pad, on));
const gestures = new PadGestures((pad, g) => router.gesture(pad, g));

const ui = mountUi(document.querySelector<HTMLDivElement>('#app')!, {
  async onStart() {
    try {
      engine = await Engine.create({
        onStates: (s) => ui.setStates(s),
        onMic: (open) => ui.setMic(open),
        onReverse: (on) => ui.setPadOn(4, on),
        onStutter: (on) => ui.setPadOn(5, on),
        onAutotune: (on) => ui.setPadOn(6, on),
        onDetected: (m) => ui.setDetected(m),
        onError: (kind) => ui.notice(MIC_ERRORS[kind]),
      });
    } catch (e) {
      ui.notice(`No se pudo iniciar el audio: ${(e as Error).message}`);
      return;
    }
    refreshMics = async () => {
      if (!engine) return;
      ui.setMics(await engine.listMics(), engine.currentMicId());
    };
    void refreshMics();
    navigator.mediaDevices?.addEventListener?.('devicechange', () => void refreshMics());
    const meter = () => {
      ui.setLevel(engine?.inputLevel() ?? 0);
      requestAnimationFrame(meter);
    };
    requestAnimationFrame(meter);
  },
  onPad: (pad, down) => (down ? gestures.down(pad) : gestures.up(pad)),
  onKnob: (index, value) => dispatch({ type: 'knob', index, value }),
  onLearnTarget: (c) => (learnTarget = c),
  onScale: (tonic, scale) => dispatch({ type: 'setScale', tonic, scale }),
  onNoteMode: (on) => router.setNoteMode(on),
  onMicSelect: (id) => {
    // Después de intentarlo, el selector muestra el micrófono que de verdad quedó activo.
    void engine?.setMicDevice(id).then(() => refreshMics());
  },
});

void startMidi(() => mapping, {
  onStatus: (s, name) => ui.setMidiStatus(s, name),
  onRaw(key, e) {
    ui.logMidi(`${key}  ${e.kind === 'cc' ? 'valor' : 'vel'} ${e.value}`);
    if (learnTarget && e.kind !== 'noteOff') {
      mapping = learn(mapping, key, learnTarget);
      saveMapping(storage, mapping);
      learnTarget = null;
      skipNextControl = true;
      ui.endLearn();
    }
  },
  onControl(control, e) {
    if (skipNextControl) {
      skipNextControl = false;
      return;
    }
    const n = Number(control.slice(-1)) - 1;
    if (control.startsWith('pad')) {
      if (e.kind === 'noteOn') gestures.down(n);
      else if (e.kind === 'noteOff') gestures.up(n);
    } else if (e.kind === 'cc') {
      ui.setKnob(n, e.value);
      dispatch({ type: 'knob', index: n, value: e.value / 127 });
    }
  },
});
