# Voz Looper — documento de diseño

Fecha: 2026-11-08
Estado: aprobado

## 1. Objetivo

Una página web para **jugar con la voz**: grabar frases con el micrófono,
repetirlas en loop, encimarlas, deformarlas con efectos y pasarlas por
**autotune**, controlando todo con un **Akai Professional LPD8**. El sonido
sale por la salida de audio de la computadora hacia un **Roland P-6**, que
lo samplea por su entrada.

**Qué cuenta como éxito:**

- Con el LPD8 conectado a la computadora puedo grabar 4 loops de voz que
  suenan en sincronía y encenderlos o apagarlos con los pads.
- Las 8 perillas cambian los efectos en tiempo real sin cortes ni chasquidos.
- Hablando normal con el autotune encendido, la voz suena "cantada"
  (hard-tune), y con los pads puedo forzar notas para hacer una melodía.
- Lo que oigo es exactamente lo que sale hacia el P-6.
- En iPad/iPhone la página funciona con los dedos.

**Lo que dijo el usuario vs. lo que se supone:**

| Dicho por el usuario | Supuesto (corregible) |
|---|---|
| Es para jugar y para samplear en el P-6 | El P-6 se conecta con cable a la salida de audio |
| El P-6 graba el audio, no hace falta exportar | No se guardan archivos WAV en la v1 |
| Se trabaja desde la computadora | El navegador es Chrome o Edge |
| iPad/iPhone sería bueno, si no, ni modo | En iPad se usa con los dedos; con LPD8 solo si la app *Web MIDI Browser* funciona |
| Autotune con dos modos (automático y con pads) | Hard-tune estilo "entrevista cantada", no corrección invisible |

## 2. Plataforma

- **Página web estática** en TypeScript, empaquetada con **Vite**, sin
  framework de interfaz (la pantalla es sencilla).
- Audio con **Web Audio API**; los procesos de muestra por muestra
  (autotune, grabación de loops, lo-fi) corren en **AudioWorklets**.
- MIDI con **Web MIDI API** (Chrome/Edge en escritorio).
- Pruebas automáticas con **Vitest**; pruebas de audio renderizado con
  Chromium + Playwright usando `OfflineAudioContext`.
- Sin servidor ni cuentas. Las preferencias (asignaciones MIDI, escala,
  posición de perillas) se guardan en `localStorage`.
- Publicación en **GitHub Pages** desde el paso 1: cada cambio subido se
  publica solo, y el usuario prueba abriendo un link (sin instalar nada).
  Además el micrófono solo funciona en páginas `https`.

## 3. Flujo del sonido

```
Micrófono ──► Autotune ──┬──► (monitor, si el micro está abierto) ──┐
                         └──► Grabador de loops                      │
                                                                     ▼
Loops 1–4 (velocidad "ardilla", al revés) ─────────────────────► Suma
                                                                     │
  Stutter → Robot → Lo-fi → Filtro → Eco → Reverb → Volumen ◄────────┘
                                                        │
                                                        ▼
                                          Salida de audio → cable → P-6
```

- El autotune va pegado al micrófono: los loops se graban ya afinados.
- "Ardilla/monstruo" y "al revés" afectan solo a los loops (no se puede
  acelerar una voz en vivo).
- Los demás efectos afectan a todo lo que suena.

## 4. Controles

### 4.1 Pads — modo normal (botón PAD del LPD8)

| Pad | Acción |
|---|---|
| 1–4 | **Loop 1–4.** Estados: *vacío → grabando → sonando ⇄ silenciado*. Toque en vacío: graba (abre el micro si estaba cerrado). Toque grabando: cierra el loop y empieza a sonar. Toque sonando: silencia. Toque silenciado: vuelve a sonar. Mantener ≥ 1 s en cualquier estado: borra y vuelve a *vacío*. |
| 5 | **Al revés** (alterna). Todos los loops suenan en reversa. |
| 6 | **Stutter** mientras se mantiene presionado. |
| 7 | **Autotune** encendido/apagado (arranca encendido). |
| 8 | **Micrófono** abierto/cerrado (arranca cerrado). Abrirlo muestra un aviso de usar audífonos para evitar acople. |

### 4.2 Pads — modo notas

Se activa con el botón **CC** del LPD8 (o el interruptor "Modo notas" en
pantalla). Los 8 pads son los grados 1 a 8 de la escala elegida, a partir
de la tónica hacia arriba (si la escala tiene menos de 8 notas, continúa
en la octava siguiente). Mientras se mantiene un pad, el autotune lleva la
voz a esa nota; al soltarlo vuelve al modo automático. Si se presionan
varios, manda el último. La octava se elige sola: la más cercana a la voz
que está entrando, para evitar saltos enormes.

Si los mensajes que manda el LPD8 en modo CC chocan con los de las
perillas (depende del modelo y su configuración), se usa el interruptor de
pantalla o se reasigna con "aprender".

### 4.3 Perillas

| Perilla | Efecto | Izquierda (0) | Derecha (127) |
|---|---|---|---|
| 1 | Ardilla / monstruo (velocidad de los loops) | 0.5× (una octava abajo) | 2× (una octava arriba); centro = normal, con zona muerta |
| 2 | Robot / alien (modulador en anillo, 30–300 Hz) | apagado | máximo |
| 3 | Eco (delay ~375 ms; más perilla = más volumen y más repeticiones) | apagado | máximo |
| 4 | Reverb (impulso generado de ~2.5 s) | apagado | máximo |
| 5 | Filtro | "bajo el agua" (pasa-bajos hasta ~300 Hz) | "teléfono" (pasa-banda ~1–3 kHz); centro = sin filtro |
| 6 | Lo-fi (reduce bits 16→4 y frecuencia de muestreo) | apagado | máximo |
| 7 | Autotune: velocidad de corrección | suave (~200 ms) | robot (0 ms) |
| 8 | Volumen general | silencio | máximo |

Todos los cambios de perilla se suavizan (~20 ms) para evitar chasquidos.

### 4.4 Pantalla

- Los mismos 8 pads y 8 perillas, táctiles (para iPad/iPhone o el ratón).
- Botón **Empezar** (el navegador exige un toque para activar el audio).
- Selector de escala: tónica (12 notas) y tipo (Mayor, Menor,
  Pentatónica menor, Cromática). Por defecto: Do mayor.
- Interruptor **Modo notas**.
- Indicador de LPD8 conectado/desconectado.
- Botón **Aprender**: tocar un control en pantalla y luego mover/tocar uno
  del LPD8 los conecta.
- **Monitor MIDI** plegable: muestra los últimos mensajes que llegan
  (sirve para ver qué manda tu LPD8).
- Medidor de nivel de entrada y nota detectada (ej. "La 4").

## 5. Piezas del sistema

Cada pieza hace una cosa y se prueba por separado.

| Pieza | Qué hace | Depende de |
|---|---|---|
| `controls` | Lista central de acciones (`loopTap(n)`, `loopHold(n)`, `setKnob(k, v)`, `notePress(i)`…). MIDI y pantalla llaman a las mismas acciones. | — |
| `midi` | Conecta el LPD8, traduce mensajes a acciones, maneja "aprender" y la conexión/desconexión en caliente. Asignaciones por defecto cubren el LPD8 y el LPD8 MK2 de fábrica. | `controls` |
| `looper` | 4 loops sincronizados (lógica de estados + reproducción). | Worklet de grabación |
| `autotune` | Detección de tono (YIN, 70–1000 Hz) y cambio de tono (PSOLA) en un AudioWorklet; elige la nota objetivo según escala o pad. | `scales` |
| `scales` | Funciones puras: escalas, nota más cercana, nota del pad, conversión Hz ↔ nota. | — |
| `effects` | Cadena de efectos y su conexión a las perillas. | Worklet lo-fi |
| `ui` | Dibuja la pantalla y manda toques a `controls`. | `controls` |
| `app` | Arranca todo y une las piezas. | todas |

### 5.1 Reglas del looper

- El **primer loop** que se cierra define la **duración base** (máx. 30 s).
- Los loops siguientes empiezan a grabar al tocar el pad y, al cerrarlos,
  su duración se redondea hacia arriba al siguiente múltiplo de la
  duración base. Conservan su posición respecto al ciclo base para no
  desfasarse.
- Si se borran todos los loops, la duración base se olvida.
- La grabación compensa el retraso de entrada/salida que reporta el
  navegador, para que el loop no quede corrido.

### 5.2 Autotune

- Ventana de análisis de ~2048 muestras; si no detecta una nota clara
  (consonantes, silencio), deja pasar la voz sin cambios.
- Nota objetivo: la del pad presionado (modo notas) o la nota de la escala
  más cercana a la detectada (automático).
- La perilla 7 controla qué tan rápido se mueve hacia la nota objetivo.
  En 0 ms salta de golpe: ese es el sonido "entrevista cantada".
- Retraso total esperado: decenas de milisegundos.

### 5.3 Stutter

Mientras se mantiene el pad 6, repite el último fragmento de la salida:
1/16 de la duración base si hay loops, o 125 ms si no.

## 6. Errores y casos especiales

| Caso | Comportamiento |
|---|---|
| El navegador no tiene Web MIDI (Safari, iPhone) | Aviso: "Este navegador no lee el LPD8; usa los controles en pantalla". Todo lo demás funciona. |
| Se niega el permiso del micrófono | Aviso con instrucciones para permitirlo; los loops ya grabados y los efectos siguen funcionando. |
| El LPD8 se desconecta/conecta | Se detecta solo, se actualiza el indicador y se reconecta sin recargar. |
| Loop llega a 30 s grabando | Se cierra solo. |
| Página en `http` (no segura) | Aviso de que el micrófono requiere `https` o `localhost`. |

## 7. Pruebas

- **Automáticas (Vitest):** `scales` (nota más cercana, escalas, notas de
  pads), estados del looper y redondeo de duraciones, traducción de
  mensajes MIDI y "aprender", detección de tono con ondas generadas
  (ej. una senoidal de 445 Hz se detecta como ~445 Hz).
- **Audio renderizado (Playwright + OfflineAudioContext):** pasar una
  senoidal de 445 Hz por el autotune en Do mayor y medir que sale a
  ~440 Hz (La); verificar que los efectos en 0 no alteran la señal.
- **Por oído (el usuario):** al final de cada paso, una lista corta de qué
  probar con el LPD8, el micrófono y el P-6.

## 8. Orden de construcción

1. Micrófono, 4 loops y pads del LPD8 (incluye monitor MIDI, "aprender" y
   publicación automática en GitHub Pages).
2. Perillas y efectos.
3. Autotune automático.
4. Modo notas con los pads.
5. Ajustes táctiles y prueba en iPad.

Cada paso queda funcionando y probado antes del siguiente.

## 9. Fuera de alcance (v1)

- Efectos distintos por loop.
- Exportar/guardar archivos WAV.
- Cambio de tono sin cambiar velocidad como perilla independiente.
- App nativa para iPad.
- Más de 4 loops o bancos de programas del LPD8.
