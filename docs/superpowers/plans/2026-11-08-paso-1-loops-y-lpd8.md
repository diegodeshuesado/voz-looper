# Paso 1 — Micrófono, 4 loops y pads del LPD8: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página web publicada en GitHub Pages donde, con el micrófono y un LPD8, se graban 4 loops de voz sincronizados que se silencian y se borran con los pads.

**Architecture:** Vite + TypeScript sin framework. La lógica pura (loops, MIDI, gestos de pad) vive en módulos sin dependencias del navegador y se prueba con Vitest. Un AudioWorklet envuelve el núcleo del looper; `engine.ts` arma el grafo de audio; `controls.ts` es la lista central de acciones que llaman tanto el MIDI como la pantalla.

**Tech Stack:** TypeScript 5, Vite 5, Vitest 2, Web Audio (AudioWorklet), Web MIDI, Playwright (preinstalado, para la prueba de humo), GitHub Actions + Pages.

**Spec:** `docs/superpowers/specs/2026-11-08-voz-looper-design.md` (secciones 3, 4.1, 4.4, 5, 5.1, 6, 7, 8-paso 1)

## Global Constraints

- Navegador objetivo: Chrome/Edge escritorio; en Safari/iOS todo funciona con controles en pantalla.
- Sin servidor, sin cuentas. Preferencias en `localStorage`, siempre dentro de `try/catch`.
- Loop máximo: **30 s**. Mantener pad **≥ 1 s** = borrar.
- Micrófono arranca **cerrado**; grabar un loop lo abre solo.
- Cambios de ganancia suavizados ~20 ms (`setTargetAtTime`, constante 0.005 s).
- Vite `base: '/voz-looper/'`.
- Textos de la interfaz en español.
- Pads 5, 6, 7 y perillas 1–7 existen en pantalla y en el mapeo, pero sus acciones no hacen nada todavía (pasos 2–4). La perilla 8 (volumen) sí funciona.

## Review Focus

1. **Tocar otro pad mientras uno graba** → el que grababa se cierra y empieza a sonar; el nuevo empieza a grabar. (Test en Task 2.)
2. **Toque-toque instantáneo (0 muestras grabadas)** → el loop vuelve a *vacío*, sin fijar duración base. (Test en Task 2.)
3. **LPD8 se desconecta y se vuelve a conectar** con la página abierta → el indicador cambia y los pads vuelven a responder sin recargar. (Test en Task 4.)
4. **`localStorage` bloqueado** (ventana privada) → se usan asignaciones de fábrica, sin error. (Test en Task 3.)
5. **Sin Web MIDI o permiso de micrófono negado** → aviso en pantalla; los controles en pantalla siguen funcionando. (Prueba de humo en Task 6.)

---

## Estructura de archivos

| Archivo | Responsabilidad |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore` | Proyecto |
| `src/controls.ts` | Tipo `Action` y despachador |
| `src/looper/looper-core.ts` | Núcleo puro del looper (estados, sincronía, latencia) |
| `src/looper/looper-worklet.ts` | AudioWorkletProcessor que envuelve `LooperCore` |
| `src/midi/mapping.ts` | Parseo de mensajes, mapeo por defecto, aprender, guardado |
| `src/midi/pad-gestures.ts` | Toque vs. mantener 1 s |
| `src/midi/midi.ts` | Conexión Web MIDI, conexión en caliente, monitor |
| `src/audio/engine.ts` | AudioContext, micrófono, compuerta, worklet, volumen, medidor |
| `src/ui/ui.ts`, `src/style.css` | Pantalla |
| `src/main.ts` | Une todo |
| `tests/*.test.ts` | Vitest |
| `e2e/smoke.cjs` | Prueba de humo en Chromium |
| `.github/workflows/pages.yml` | Publicación |

---

### Task 1: Proyecto base y publicación en GitHub Pages

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.gitignore`, `src/main.ts`, `src/style.css`, `.github/workflows/pages.yml`, `tests/sanity.test.ts`

**Interfaces:**
- Produces: scripts `npm run dev`, `npm run build`, `npm test` (vitest run), `npm run e2e` (`node e2e/smoke.cjs`, se usa en Task 6).

- [ ] **Step 1:** `package.json` con devDependencies `typescript@^5.6`, `vite@^5.4`, `vitest@^2.1`, `@types/audioworklet` (los tipos de Web MIDI ya vienen en `lib.dom`). `tsconfig.json`: `strict`, `target ES2022`, `lib ["ES2022","DOM"]`, `moduleResolution "bundler"`. `vite.config.ts`: `base: '/voz-looper/'`, `test.environment: 'node'`.
- [ ] **Step 2:** `index.html` con `<div id="app">`, título "Voz Looper", `<script type="module" src="/src/main.ts">`. `src/main.ts` pinta "Voz Looper" en `#app`.
- [ ] **Step 3:** `tests/sanity.test.ts`: `expect(1 + 1).toBe(2)`. Run: `npm install && npm test` → PASS. Run: `npm run build` → crea `dist/index.html`.
- [ ] **Step 4:** `.github/workflows/pages.yml`: on push a `main` y `claude/**`, y `workflow_dispatch`; permisos `pages: write`, `id-token: write`, `contents: read`; job build (`actions/checkout@v4`, `actions/setup-node@v4` node 20, `npm ci`, `npm test`, `npm run build`, `actions/upload-pages-artifact@v3` con `path: dist`) y job deploy (`actions/deploy-pages@v4`, environment `github-pages`).
- [ ] **Step 5:** Commit `chore: proyecto base Vite + TS y publicación en Pages` y push. Avisar al usuario que active **Settings → Pages → Source: GitHub Actions** (una sola vez).

---

### Task 2: Núcleo del looper

**Files:**
- Create: `src/looper/looper-core.ts`
- Test: `tests/looper-core.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type TrackState = 'empty' | 'recording' | 'playing' | 'muted';
  export class LooperCore {
    constructor(sampleRate: number, opts?: { maxSeconds?: number; latencySamples?: number; tracks?: number });
    tap(track: number): void;
    clear(track: number): void;
    process(input: Float32Array, output: Float32Array): void; // sobrescribe output con la mezcla
    readonly states: TrackState[];
    readonly baseLength: number | null; // en muestras
  }
  ```
  Valores por defecto: `maxSeconds 30`, `latencySamples 0`, `tracks 4`.

**Reglas (de spec 5.1, más decisiones de este plan):**
- Contador global de muestras `pos` que avanza en cada `process`.
- `tap` en *empty*: si otra pista está *recording*, primero se cierra esa; luego esta pasa a *recording* con `start = pos`.
- `tap` en *recording*: cierra. `n` = muestras grabadas. Si `n == 0` → *empty*. Si no hay base: `length = n`, `baseLength = n`. Si hay base: `length = ceil(n / base) * base` (resto en silencio). Estado → *playing*. `anchor = start - latencySamples`.
- *playing* ⇄ *muted* con `tap`.
- Reproducción: `output[i] += buf[mod(pos_i - anchor, length)]` para pistas *playing*. Las pistas *recording* y *muted* no suenan.
- Auto-cierre: primera pista al llegar a `maxSeconds * sampleRate`; las siguientes al llegar a `floor(max / base) * base`.
- `clear`: pista → *empty*; si todas quedan *empty*, `baseLength = null`.
- Memoria: reservar un `Float32Array` de `maxSeconds * sampleRate` por pista en el constructor (nada de asignar memoria dentro de `process`).

- [ ] **Step 1: Tests** (usar `sampleRate = 100`, `maxSeconds = 30` → 3000 muestras; helper `run(core, samples: number[]) => number[]` en bloques de 128):
  - `primer loop fija la base`: tap(0), procesar 1000 muestras de valor 0.5, tap(0) → `baseLength === 1000`, `states[0] === 'playing'`; procesar 1000 ceros → todas las salidas `0.5`.
  - `loop siguiente se redondea a múltiplo de la base`: base 1000; grabar 1500 en pista 1 → al reproducir 2000 muestras, primeras 1500 valen el grabado y las últimas 500 son la pista 0 sola.
  - `silenciar y volver`: tap en *playing* → salida 0; tap otra vez → vuelve.
  - `mantener borra y olvida la base`: clear(0) con única pista → `states[0] === 'empty'`, `baseLength === null`.
  - `toque-toque sin muestras vuelve a vacío`: tap(0), tap(0) sin `process` → `'empty'`, `baseLength === null`.
  - `tocar otra pista mientras graba cierra la primera`: tap(0), 500 muestras, tap(1) → `states` = `['playing','recording',…]`, `baseLength === 500`.
  - `auto-cierre a 30 s`: tap(0), 3100 muestras → `'playing'`, `baseLength === 3000`.
  - `auto-cierre de pista siguiente`: base 1000; pista 1 graba 3100 → se cierra en 3000, `'playing'`.
  - `compensa latencia`: `latencySamples 10`, base 100; impulso 1.0 en la primera muestra grabada, cierre; la salida trae el impulso en `pos = start + 100 - 10`.
- [ ] **Step 2:** `npx vitest run tests/looper-core.test.ts` → FAIL (módulo no existe).
- [ ] **Step 3:** Implementar `LooperCore` en `src/looper/looper-core.ts` según las reglas.
- [ ] **Step 4:** `npx vitest run tests/looper-core.test.ts` → PASS.
- [ ] **Step 5:** Commit `feat: núcleo del looper con sincronía y compensación de latencia`.

---

### Task 3: Mapeo MIDI, aprender y gestos de pad

**Files:**
- Create: `src/controls.ts`, `src/midi/mapping.ts`, `src/midi/pad-gestures.ts`
- Test: `tests/mapping.test.ts`, `tests/pad-gestures.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // controls.ts
  export type Action =
    | { type: 'loopTap'; track: number } | { type: 'loopHold'; track: number }
    | { type: 'toggleMic' } | { type: 'toggleReverse' } | { type: 'stutter'; on: boolean }
    | { type: 'toggleAutotune' } | { type: 'knob'; index: number; value: number }; // value 0..1
  export type Dispatch = (a: Action) => void;
  export function padAction(pad: number /*0..7*/, gesture: 'tap' | 'hold' | 'release'): Action | null;

  // mapping.ts
  export type ControlId = `pad${1|2|3|4|5|6|7|8}` | `knob${1|2|3|4|5|6|7|8}`;
  export type MidiKey = `note:${number}` | `cc:${number}`;
  export type MidiEvent = { kind: 'noteOn' | 'noteOff' | 'cc'; number: number; value: number };
  export type Mapping = Record<MidiKey, ControlId>;
  export function parseMidi(data: Uint8Array): MidiEvent | null;
  export function keyOf(e: MidiEvent): MidiKey;
  export const DEFAULT_MAPPING: Mapping;
  export function learn(m: Mapping, key: MidiKey, control: ControlId): Mapping;
  export function loadMapping(storage: Pick<Storage,'getItem'> | null): Mapping;
  export function saveMapping(storage: Pick<Storage,'setItem'> | null, m: Mapping): void;

  // pad-gestures.ts
  export class PadGestures {
    constructor(onGesture: (pad: number, g: 'tap' | 'hold' | 'release') => void, holdMs?: number /*1000*/);
    down(pad: number): void; up(pad: number): void;
  }
  ```

**Valores fijados:**
- `DEFAULT_MAPPING`: `note:36…43` → `pad1…pad8`; `cc:1…8` y `cc:70…77` → `knob1…knob8` (cubre LPD8 y LPD8 MK2 de fábrica).
- `parseMidi`: cualquier canal; `0x9n` con velocidad 0 = `noteOff`; `0x8n` = `noteOff`; `0xBn` = `cc`; lo demás `null`.
- `learn`: quita las llaves que apuntaban a ese control y asigna la nueva.
- Guardado en la llave `vozlooper.mapping`; JSON inválido, `null` o excepción → `DEFAULT_MAPPING`.
- `PadGestures`: `down` emite `tap` de inmediato y arma un temporizador; si sigue presionado a los `holdMs`, emite `hold`. `up` cancela el temporizador y emite `release`.
- `padAction`: pads 1–4 `tap`→`loopTap`, `hold`→`loopHold`; pad 5 `tap`→`toggleReverse`; pad 6 `tap`→`stutter on`, `release`→`stutter off`; pad 7 `tap`→`toggleAutotune`; pad 8 `tap`→`toggleMic`; lo demás `null`.

- [ ] **Step 1: Tests**
  - `parseMidi`: `[0x90,36,100]`→noteOn 36; `[0x99,40,0]`→noteOff 40; `[0x80,36,0]`→noteOff; `[0xB0,70,64]`→cc 70 valor 64; `[0xF8]`→null.
  - `DEFAULT_MAPPING['note:36'] === 'pad1'`, `['cc:77'] === 'knob8'`, `['cc:1'] === 'knob1'`.
  - `learn(DEFAULT_MAPPING,'note:60','pad1')` → `note:60`→pad1 y `note:36` ya no existe.
  - `loadMapping(null)` y `loadMapping({getItem: () => { throw new Error() }})` → `DEFAULT_MAPPING`; `saveMapping` con `setItem` que lanza → no lanza.
  - `PadGestures` con `vi.useFakeTimers()`: down/up a los 200 ms → `[tap, release]`; down y avanzar 1000 ms → `[tap, hold]`.
  - `padAction(0,'hold')` → `{type:'loopHold',track:0}`; `padAction(5,'release')` → `{type:'stutter',on:false}`; `padAction(4,'release')` → `null`.
- [ ] **Step 2:** `npx vitest run tests/mapping.test.ts tests/pad-gestures.test.ts` → FAIL.
- [ ] **Step 3:** Implementar los tres módulos.
- [ ] **Step 4:** Mismo comando → PASS.
- [ ] **Step 5:** Commit `feat: mapeo MIDI del LPD8, aprender y gestos de pad`.

---

### Task 4: Conexión Web MIDI con reconexión en caliente

**Files:**
- Create: `src/midi/midi.ts`
- Test: `tests/midi.test.ts`

**Interfaces:**
- Consumes: `parseMidi`, `keyOf`, `Mapping`, `ControlId`, `MidiEvent` (Task 3).
- Produces:
  ```ts
  export type MidiStatus = 'unsupported' | 'denied' | 'disconnected' | 'connected';
  export interface MidiHandlers {
    onControl(control: ControlId, e: MidiEvent): void;
    onRaw(key: MidiKey, e: MidiEvent): void;          // monitor y aprender
    onStatus(status: MidiStatus, deviceName?: string): void;
  }
  export function startMidi(
    getMapping: () => Mapping, h: MidiHandlers,
    nav?: { requestMIDIAccess?: () => Promise<MIDIAccess> }  // por defecto navigator
  ): Promise<void>;
  ```

**Comportamiento:** sin `requestMIDIAccess` → `onStatus('unsupported')`; promesa rechazada → `'denied'`. Escucha **todas** las entradas (no filtra por nombre). En `onstatechange` vuelve a enganchar `onmidimessage` a cada entrada y reporta `'connected'` (con el nombre de la primera entrada) o `'disconnected'` si no queda ninguna.

- [ ] **Step 1: Tests** con un `MIDIAccess` falso (objeto con `inputs: Map`, `onstatechange`):
  - sin `requestMIDIAccess` → status `'unsupported'`.
  - entrada conectada, mensaje `[0x90,36,100]` → `onControl('pad1', …)` y `onRaw('note:36', …)`.
  - quitar la entrada del Map y disparar `onstatechange` → `'disconnected'`; agregar una nueva y disparar → `'connected'` y sus mensajes llegan a `onControl`.
- [ ] **Step 2:** `npx vitest run tests/midi.test.ts` → FAIL.
- [ ] **Step 3:** Implementar `startMidi`.
- [ ] **Step 4:** Mismo comando → PASS.
- [ ] **Step 5:** Commit `feat: conexión Web MIDI con reconexión en caliente`.

---

### Task 5: Motor de audio y worklet del looper

**Files:**
- Create: `src/looper/looper-worklet.ts`, `src/audio/engine.ts`

**Interfaces:**
- Consumes: `LooperCore`, `TrackState` (Task 2); `Action` (Task 3).
- Produces:
  ```ts
  export interface EngineEvents {
    onStates(states: TrackState[]): void;
    onMic(open: boolean): void;
    onError(kind: 'mic-denied' | 'insecure'): void;
  }
  export class Engine {
    static create(ev: EngineEvents): Promise<Engine>;  // debe llamarse tras un toque
    handle(a: Action): void;
    inputLevel(): number;  // 0..1, RMS del micrófono
  }
  ```

**Grafo:** `getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}})` → `micGate` (GainNode) → `looperNode` (AudioWorkletNode, 1 entrada/1 salida mono) y también `micGate` → `master`; `looperNode` → `master` (GainNode) → `destination`. `AnalyserNode` colgado de la fuente para `inputLevel`.

- Worklet: importar con `import url from './looper-worklet.ts?worker&url'` y `audioWorklet.addModule(url)`. `latencySamples = round((ctx.baseLatency + (ctx.outputLatency || 0)) * sampleRate)` vía `processorOptions`. Mensajes de entrada `{type:'tap'|'clear', track}`; publica `{states}` solo cuando cambian.
- `handle`: `loopTap` → si la pista está *empty*, abre el micrófono antes de mandar `tap`; `loopHold` → `clear`; `toggleMic` → `micGate` 0/1 suavizado; `knob` con `index 7` → ganancia de `master` (curva `value²`); el resto se ignora en este paso.
- Si `isSecureContext` es falso → `onError('insecure')`; si `getUserMedia` falla → `onError('mic-denied')` y el motor sigue funcionando sin entrada.

- [ ] **Step 1:** Implementar worklet y motor.
- [ ] **Step 2:** `npm run build` → sin errores de tipos; `dist/assets` contiene el worklet empaquetado.
- [ ] **Step 3:** Commit `feat: motor de audio con micrófono, compuerta y looper en AudioWorklet`.

(Se verifica de punta a punta en Task 6.)

---

### Task 6: Pantalla, unión de todo y prueba de humo

**Files:**
- Create: `src/ui/ui.ts`, `e2e/smoke.cjs`
- Modify: `src/main.ts`, `src/style.css`, `README.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces:
  ```ts
  export interface UiHandle {
    setStates(s: TrackState[]): void; setMic(open: boolean): void;
    setMidiStatus(s: MidiStatus, name?: string): void; logMidi(text: string): void;
    setLevel(v: number): void; notice(text: string | null): void;
  }
  export function mountUi(root: HTMLElement, opts: {
    onStart(): void; onPad(pad: number, down: boolean): void; onKnob(index: number, value: number): void;
    onLearnTarget(control: ControlId | null): void;
  }): UiHandle;
  ```

**Pantalla:**
- Botón **Empezar** (oculta el resto hasta tocarlo).
- Rejilla de 8 pads en el orden físico del LPD8 (fila de abajo 1–4, fila de arriba 5–8) con `data-pad="1..8"` y `data-state`. Colores por estado: vacío gris, grabando rojo parpadeando, sonando verde, silenciado amarillo. Etiquetas: "Loop 1–4", "Al revés", "Stutter", "Autotune", "Micro".
- 8 perillas (`input type=range`, 0–127, `data-knob="1..8"`), etiquetas de spec 4.3; la 8 arranca en 100.
- Indicador "LPD8 conectado / desconectado / este navegador no lee el LPD8; usa los controles en pantalla".
- Botón **Aprender**: al activarlo, el siguiente control de pantalla tocado queda como objetivo y el siguiente mensaje MIDI se le asigna (`learn` + `saveMapping`).
- **Monitor MIDI** plegable (`<details>`), últimas 10 líneas tipo `note:36 vel 100`.
- Medidor de nivel de entrada (barra).
- Avisos: micrófono negado ("Permite el micrófono en el candado de la barra de direcciones"), página insegura, recordatorio de audífonos al abrir el micro.
- Pads táctiles con `pointerdown`/`pointerup`/`pointercancel` y `touch-action: none`; diseño usable a 375 px de ancho.

**main.ts:** un `PadGestures` compartido; pads de pantalla y MIDI llaman a `gestures.down/up`; `gesture → padAction → engine.handle`. Perillas MIDI (`cc`) → `{type:'knob', index, value: v/127}` y mueven el slider de pantalla. `requestAnimationFrame` actualiza el medidor. MIDI arranca al cargar (para mostrar estado); audio al tocar Empezar.

- [ ] **Step 1:** Escribir `e2e/smoke.cjs` (usa `require('playwright')` preinstalado): lanza Chromium con `--use-fake-ui-for-media-stream --use-fake-device-for-media-stream`, abre `vite preview` en `http://localhost:4173/voz-looper/`, toca Empezar, verifica el texto del aviso de MIDI (en headless no hay dispositivos: debe decir *desconectado* o *no lee*), hace click en el pad 1, espera 1 s, click otra vez → `data-state="playing"` en `[data-pad="1"]`; mantiene el pad 1 presionado 1.2 s → `data-state="empty"`. Segunda corrida con el permiso de micrófono denegado (sin `--use-fake-ui-for-media-stream`, `permissions: []`) → aparece el aviso de micrófono y los pads siguen respondiendo (pad 8 cambia `data-state`). Sale con código ≠ 0 si algo falla.
- [ ] **Step 2:** `npm run build && npm run e2e` → FAIL (no hay UI todavía).
- [ ] **Step 3:** Implementar `ui.ts`, unir en `main.ts`, estilos.
- [ ] **Step 4:** `npm test && npm run build && npm run e2e` → todo PASS.
- [ ] **Step 5:** README: link a la página publicada y lista "Cómo probar el paso 1" (la de abajo).
- [ ] **Step 6:** Commit `feat: pantalla del paso 1 y prueba de humo`, push; confirmar que el workflow de Pages termina en verde.

**Lista de prueba para el usuario (va en el README y en el mensaje final):**
1. Conectar el LPD8; abrir el link en Chrome; tocar **Empezar** y permitir micrófono y MIDI.
2. Ver "LPD8 conectado".
3. Con audífonos: pad 1, decir algo, pad 1 → se repite.
4. Pad 2, otra frase, pad 2 → suenan juntos y a tiempo.
5. Pad 1 → se silencia; otra vez → regresa.
6. Mantener pad 1 un segundo → se borra.
7. Pad 8 → abre/cierra el micro. Perilla 8 → volumen.
8. Si algo no responde: abrir **Monitor MIDI** y decir qué aparece.
