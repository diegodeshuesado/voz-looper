import type { TrackState } from '../looper/looper-core';
import type { ControlId } from '../midi/mapping';
import type { MidiStatus } from '../midi/midi';

export interface UiHandle {
  setStates(s: TrackState[]): void;
  setMic(open: boolean): void;
  setPadOn(pad: number, on: boolean): void; // pad 0..7
  setMics(list: { id: string; label: string }[], current?: string): void;
  setMidiStatus(s: MidiStatus, name?: string): void;
  logMidi(text: string): void;
  setLevel(v: number): void;
  setKnob(index: number, value127: number): void;
  notice(text: string | null): void;
  endLearn(): void;
}

export interface UiOptions {
  onStart(): void;
  onPad(pad: number, down: boolean): void; // pad 0..7
  onKnob(index: number, value: number): void; // index 0..7, value 0..1
  onLearnTarget(control: ControlId | null): void;
  onMicSelect(deviceId: string): void;
}

const PAD_LABELS = ['Loop 1', 'Loop 2', 'Loop 3', 'Loop 4', 'Al revés', 'Stutter', 'Autotune', 'Micro'];
const KNOB_LABELS = ['Ardilla / monstruo', 'Robot', 'Eco', 'Reverb', 'Filtro', 'Lo-fi', 'Autotune', 'Volumen'];
const SOON = new Set([6]); // autotune: paso 3
const SOON_PADS = new Set([6]);

const MIDI_TEXT: Record<MidiStatus, (name?: string) => string> = {
  connected: (n) => `${n ?? 'LPD8'} conectado`,
  disconnected: () => 'LPD8 desconectado: conéctalo por USB',
  unsupported: () => 'Este navegador no lee el LPD8; usa los controles en pantalla',
  denied: () => 'MIDI bloqueado: permítelo en el candado de la barra de direcciones',
};

const LEARN_IDLE = 'Aprender';

export function mountUi(root: HTMLElement, opts: UiOptions): UiHandle {
  root.innerHTML = `
    <header class="top">
      <h1>Voz Looper</h1>
      <span class="midi" data-midi-status data-status="searching">Buscando LPD8…</span>
    </header>
    <p class="notice" data-notice hidden></p>
    <section class="start" data-start>
      <p>Conecta tu LPD8 y tus audífonos, luego toca:</p>
      <button type="button" class="start-btn">Empezar</button>
    </section>
    <main class="board" data-board hidden>
      <div class="pads">
        ${[4, 5, 6, 7, 0, 1, 2, 3]
          .map(
            (i) => `<button type="button" class="pad${SOON_PADS.has(i) ? ' soon' : ''}" data-pad="${i + 1}"
              data-state="${i < 4 ? 'empty' : 'off'}"><span class="num">${i + 1}</span>${PAD_LABELS[i]}</button>`,
          )
          .join('')}
      </div>
      <p class="hint">Toca un loop para grabar y otra vez para cerrarlo. Toca para silenciar. Mantén 1 s para borrar. Usa audífonos para que el micro no se acople.</p>
      <div class="meter" aria-label="Nivel del micrófono"><div class="meter-fill" data-meter></div></div>
      <div class="knobs">
        ${KNOB_LABELS.map(
          (label, i) => `<label class="knob${SOON.has(i) ? ' soon' : ''}">
            <span>${i + 1}. ${label}${SOON.has(i) ? ' <em>(pronto)</em>' : ''}</span>
            <input type="range" min="0" max="127" value="${i === 7 ? 100 : i === 0 || i === 4 ? 64 : 0}" data-knob="${i + 1}" />
          </label>`,
        ).join('')}
      </div>
      <label class="mic-select">Micrófono
        <select data-mic-select><option value="">Predeterminado</option></select>
      </label>
      <div class="tools">
        <button type="button" class="learn" data-learn>${LEARN_IDLE}</button>
        <span class="learn-help" data-learn-help></span>
      </div>
      <details class="monitor">
        <summary>Monitor MIDI</summary>
        <pre data-monitor>(todavía no llega nada)</pre>
      </details>
    </main>`;

  const $ = <T extends Element>(sel: string) => root.querySelector<T>(sel)!;
  const notice = $<HTMLParagraphElement>('[data-notice]');
  const midi = $<HTMLSpanElement>('[data-midi-status]');
  const meter = $<HTMLDivElement>('[data-meter]');
  const monitor = $<HTMLPreElement>('[data-monitor]');
  const learnBtn = $<HTMLButtonElement>('[data-learn]');
  const learnHelp = $<HTMLSpanElement>('[data-learn-help]');
  const pads = [...root.querySelectorAll<HTMLButtonElement>('[data-pad]')];
  const padEl = (i: number) => pads.find((p) => p.dataset.pad === String(i + 1))!;
  const knobs = [...root.querySelectorAll<HTMLInputElement>('[data-knob]')];
  const micSelect = $<HTMLSelectElement>('[data-mic-select]');
  micSelect.addEventListener('change', () => {
    if (micSelect.value) opts.onMicSelect(micSelect.value);
  });
  const lines: string[] = [];

  let learning: 'off' | 'pick' | 'wait' = 'off';
  const setLearn = (state: typeof learning, help = '') => {
    learning = state;
    learnBtn.classList.toggle('active', state !== 'off');
    learnBtn.textContent = state === 'off' ? LEARN_IDLE : 'Cancelar';
    learnHelp.textContent = help;
  };
  const pickTarget = (control: ControlId) => {
    setLearn('wait', `Ahora toca o mueve el control del LPD8 para "${control}".`);
    opts.onLearnTarget(control);
  };

  $<HTMLButtonElement>('.start-btn').addEventListener('click', () => {
    $<HTMLElement>('[data-start]').hidden = true;
    $<HTMLElement>('[data-board]').hidden = false;
    opts.onStart();
  });

  learnBtn.addEventListener('click', () => {
    if (learning === 'off') setLearn('pick', 'Toca en pantalla el pad o perilla que quieres asignar.');
    else {
      setLearn('off');
      opts.onLearnTarget(null);
    }
  });

  for (const el of pads) {
    const i = Number(el.dataset.pad) - 1;
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (learning === 'pick') return pickTarget(`pad${i + 1}` as ControlId);
      if (learning !== 'off') return; // esperando al LPD8: los pads de pantalla no actúan
      el.setPointerCapture?.(e.pointerId);
      opts.onPad(i, true);
    });
    const up = () => {
      if (learning !== 'off') return;
      opts.onPad(i, false);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  knobs.forEach((el, i) => {
    el.addEventListener('pointerdown', () => {
      if (learning === 'pick') pickTarget(`knob${i + 1}` as ControlId);
    });
    el.addEventListener('input', () => opts.onKnob(i, Number(el.value) / 127));
  });

  return {
    setStates(states) {
      states.forEach((s, i) => (padEl(i).dataset.state = s));
    },
    setMic(open) {
      this.setPadOn(7, open);
    },
    setPadOn(pad, on) {
      padEl(pad).dataset.state = on ? 'on' : 'off';
    },
    setMics(list, current) {
      const items = list.length ? list : [{ id: '', label: 'Predeterminado' }];
      micSelect.replaceChildren(
        ...items.map((m) => {
          const o = document.createElement('option');
          o.value = m.id;
          o.textContent = m.label;
          o.selected = m.id === current;
          return o;
        }),
      );
    },
    setMidiStatus(s, name) {
      midi.dataset.status = s;
      midi.textContent = MIDI_TEXT[s](name);
    },
    logMidi(text) {
      lines.unshift(text);
      lines.length = Math.min(lines.length, 10);
      monitor.textContent = lines.join('\n');
    },
    setLevel(v) {
      meter.style.transform = `scaleX(${v})`;
    },
    setKnob(index, value127) {
      if (knobs[index]) knobs[index].value = String(value127);
    },
    notice(text) {
      notice.hidden = !text;
      notice.textContent = text ?? '';
    },
    endLearn() {
      setLearn('off', '¡Listo! Control asignado.');
    },
  };
}
