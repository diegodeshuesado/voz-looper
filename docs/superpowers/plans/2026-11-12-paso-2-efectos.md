# Paso 2 — Perillas y efectos: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Que las perillas 1–6 y los pads 5–6 del LPD8 (y de la pantalla) controlen ardilla/monstruo, robot, eco, reverb, filtro, lo-fi, al revés y stutter; más un selector de micrófono.

**Architecture:** La lógica de cada efecto que no trae el navegador vive en módulos puros (`LooperCore` para ardilla/al revés, `FxCore` para stutter/robot/lo-fi, `knobs.ts` para convertir perillas en parámetros) y se prueba con Vitest. Filtro, eco y reverb usan nodos nativos de Web Audio.

**Tech Stack:** igual que el paso 1.

**Spec:** `docs/superpowers/specs/2026-11-08-voz-looper-design.md` (secciones 3, 4.1 pads 5–6, 4.3, 5.3, 7)

## Global Constraints

- Cadena: `suma (loops + micro) → FxCore [stutter → robot → lo-fi] → filtro (pasa-altos + pasa-bajos) → eco → reverb → volumen → salida`.
- Ardilla y al revés afectan solo a los loops.
- Perilla en 0 (o en el centro, para ardilla y filtro) = efecto apagado y la señal pasa intacta.
- Cambios suavizados ~20 ms.
- Perilla 7 (autotune) y pad 7 siguen "pronto" (paso 3).

## Review Focus

1. **Mover ardilla mientras se graba otro loop** → los loops siguen sincronizados entre sí (todos comparten la misma velocidad).
2. **Stutter sin loops** → repite 125 ms; **con loops** → 1/16 de la duración base.
3. **Perillas en reposo** → la salida es idéntica a la entrada (test en Task 2).
4. **Cambiar de micrófono con un loop grabando** → la grabación sigue, solo cambia la fuente.
5. **Al revés + ardilla juntos** → no hay lecturas fuera del buffer (test en Task 1).

---

### Task 1: Ardilla y al revés en el looper

**Files:** Modify `src/looper/looper-core.ts`, `tests/looper-core.test.ts`

**Interfaces — Produces:** `LooperCore.setRate(rate: number): void` (0.5–2, suavizado por muestra hacia el objetivo con constante de ~20 ms), `LooperCore.setReverse(on: boolean): void`.

- La reproducción usa una posición virtual `vpos` que avanza `rate` por muestra (interpolación lineal). La grabación sigue escribiendo una muestra por muestra real; `anchor = vpos_al_empezar - latency`.
- Al revés: índice `length - 1 - idx`.

Tests: `al revés reproduce el loop invertido`; `velocidad 2 recorre el loop al doble`; `velocidad y al revés juntos nunca leen fuera del buffer (sin NaN)`; los 9 tests existentes siguen verdes.

### Task 2: FxCore (stutter, robot, lo-fi) y mapeo de perillas

**Files:** Create `src/fx/fx-core.ts`, `src/fx/knobs.ts`; tests `tests/fx-core.test.ts`, `tests/knobs.test.ts`

**Interfaces — Produces:**
```ts
// fx-core.ts
export class FxCore {
  constructor(sampleRate: number);
  setRobot(amount: number): void;   // 0..1; frecuencia 30 + 270·amount Hz; mezcla = amount
  setLofi(amount: number): void;    // 0..1; bits 16 → 4; retención de muestras 1 → 16
  setStutter(on: boolean, fragmentSamples: number): void;
  process(input: Float32Array, output: Float32Array): void;
}
// knobs.ts (v = 0..1)
export function ardillaRate(v: number): number;            // centro ±0.04 = 1; extremos 0.5 y 2
export function filterParams(v: number): { hp: number; lp: number }; // centro = {20, 20000}; 0 → lp 300; 1 → hp 1000, lp 3000
export function echoParams(v: number): { wet: number; feedback: number }; // wet v, feedback 0.6·v
export function stutterSamples(sampleRate: number, base: number | null): number; // base/16 o 125 ms
```

Tests: robot 0 y lo-fi 0 dejan pasar la señal idéntica; robot 1 cambia la señal; lo-fi 1 cuantiza a 16 niveles por lado o menos; stutter repite el último fragmento mientras está activo y al apagarlo vuelve la señal en vivo; valores de `ardillaRate`, `filterParams`, `echoParams`, `stutterSamples` en 0, centro y 1.

### Task 3: Motor, worklet de efectos, selector de micrófono y pantalla

**Files:** Create `src/fx/fx-worklet.ts`, `src/fx/reverb.ts`; Modify `src/looper/looper-worklet.ts`, `src/audio/engine.ts`, `src/ui/ui.ts`, `src/main.ts`, `e2e/smoke.cjs`, `README.md`

- El worklet del looper acepta `{type:'rate'}` y `{type:'reverse'}` y publica `baseLength` junto con `states`.
- `Engine.handle`: `knob` 0 → rate, 1 → robot, 2 → eco, 3 → reverb (ganancia húmeda = v), 4 → filtro, 5 → lo-fi, 7 → volumen; `toggleReverse`; `stutter`.
- Eco: retardo 0.375 s con realimentación. Reverb: `ConvolverNode` con impulso estéreo generado de 2.5 s (ruido con caída exponencial).
- `Engine.listMics(): Promise<{id, label}[]>`, `Engine.setMic(deviceId)`; la pantalla muestra un selector "Micrófono".
- Pantalla: quitar "(pronto)" de perillas 1–6 y pads 5–6; pad 5 y pad 6 muestran `data-state="on"` cuando están activos.
- Prueba de humo: pad 5 alterna `on/off`; pad 6 está `on` mientras se mantiene; existe el selector de micrófono; sin errores en la página.
