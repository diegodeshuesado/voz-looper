# Voz Looper

Página web para jugar con la voz: loops, efectos y autotune controlados con un Akai LPD8.

**Abrir:** https://diegodeshuesado.github.io/voz-looper/ (en Chrome o Edge)

Diseño: [docs/superpowers/specs/2026-11-08-voz-looper-design.md](docs/superpowers/specs/2026-11-08-voz-looper-design.md)

## Cómo probar el paso 1

1. Conecta el LPD8 por USB y abre el link en Chrome. Toca **Empezar** y permite micrófono y MIDI.
2. Arriba debe decir "LPD8 conectado".
3. Con audífonos: pad 1, di algo, pad 1 otra vez → se repite en loop.
4. Pad 2, otra frase, pad 2 → suenan juntos y a tiempo.
5. Pad 1 → se silencia; otra vez → regresa.
6. Mantén el pad 1 un segundo → se borra.
7. Pad 8 abre y cierra el micro. Perilla 8 → volumen.
8. Si algo no responde, abre **Monitor MIDI** y revisa qué aparece. Con **Aprender** puedes reasignar cualquier pad o perilla.

Para mandar el sonido al Roland P-6: salida de audífonos de la computadora → entrada del P-6.

## Desarrollo

```bash
npm install
npm run dev      # servidor local
npm test         # pruebas
npm run build && npm run e2e   # prueba de humo en Chromium
```
