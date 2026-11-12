# Pasos 3 y 4 — Autotune automático y modo notas: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Autotune en el micrófono (pad 7 lo enciende/apaga, perilla 7 de suave a robot), selector de escala, nota detectada en pantalla y "modo notas" donde los pads fuerzan la nota.

**Architecture:** Módulos puros probados con Vitest: `scales.ts` (escalas y notas), `yin.ts` (detección de tono), `autotune-core.ts` (detección + cambio de tono con línea de retardo de dos cabezas). Un AudioWorklet envuelve el núcleo entre `micGate` y el resto de la cadena.

**Spec:** `docs/superpowers/specs/2026-11-08-voz-looper-design.md` (4.1 pad 7, 4.2, 4.3 perilla 7, 4.4, 5.2)

## Global Constraints

- Detección YIN 70–1000 Hz; si no hay nota clara, la corrección vuelve suave a 0.
- Perilla 7: izquierda suave (~200 ms), derecha robot (0 ms). **Arranca a la derecha** (robot) porque el usuario pidió efectos exagerados.
- Autotune arranca encendido. Escala por defecto: Do mayor. Escalas: Mayor, Menor, Pentatónica menor, Cromática.
- Modo notas: los 8 pads = grados 1–8 desde la tónica; octava = la tónica más cercana por debajo de la voz; manda el último pad presionado.
- El autotune agrega un retraso fijo (también apagado, para que los loops no cambien de lugar) que se suma a la compensación de latencia.

## Review Focus

1. **Consonantes / silencio** → sin saltos raros (corrección vuelve a 0).
2. **Voz muy grave o muy aguda** fuera de 70–1000 Hz → pasa sin corrección.
3. **Encender/apagar el autotune** a media grabación → el loop no se corre de lugar.
4. **Cambiar de escala** mientras suena → la nueva escala aplica de inmediato.
5. **Soltar el pad en modo notas** → vuelve al automático.

### Task 1: `scales.ts`
`hzToMidi(hz)`, `midiToHz(m)`, `noteName(m)` ("La 4"), `nearestInScale(m, tonic, scale)` (empates hacia abajo), `padNote(i, tonic, scale, nearMidi)`. Tests: 440 Hz = 69; Do♯4 en Do mayor → Do4; pad 0 y 7 cerca de 60 en Do mayor → 60 y 72; pad 4 cerca de 50 → 55.

### Task 2: `yin.ts`
`detectPitch(buf, sampleRate, minHz = 70, maxHz = 1000): number | null`. Tests: senoidales de 110, 220 y 440 Hz (±1 %), silencio y ruido → null.

### Task 3: `autotune-core.ts`
`AutotuneCore(sampleRate)`: `setEnabled`, `setScale(tonic, scale)`, `setRetune(v)`, `setForcedDegree(i | null)`, `process(in, out)`, `latencySamples`, `detectedMidi`. Tests: 445 Hz en Do mayor con retune 1 → sale ~440 Hz; apagado → salida = entrada retrasada `latencySamples`; pad grado 2 con voz en 440 Hz → sale ~329.6 Hz (Mi4).

### Task 4: Worklet, motor, pantalla y LPD8
Worklet `autotune`; `Engine.handle`: `toggleAutotune`, `knob` 6, `notePress`/`noteRelease`, `setScale`; latencia del autotune sumada a `latencySamples`. Pantalla: quitar "(pronto)" del pad 7 y la perilla 7, selector de tónica y escala, interruptor "Modo notas" (los pads muestran los nombres de las notas), nota detectada junto al medidor. Prueba de humo: pad 7 alterna, modo notas cambia las etiquetas, selector de escala existe.
