// Prueba de humo: abre la página construida en Chromium y usa los pads en pantalla.
// Uso: npm run build && npm run e2e
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');

const URL = 'http://localhost:4173/voz-looper/';

function startServer() {
  const proc = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: ['ignore', 'pipe', 'inherit'], detached: true });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('vite preview no arrancó')), 20000);
    proc.stdout.on('data', (d) => {
      if (String(d).includes('4173')) { clearTimeout(timer); resolve(proc); }
    });
    proc.on('exit', (c) => reject(new Error(`vite preview salió con ${c}`)));
  });
}

async function holdPad(page, n, ms) {
  const box = await page.locator(`[data-pad="${n}"]`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(ms);
  await page.mouse.up();
}

async function expectState(page, n, state) {
  await page.waitForFunction(
    ([n, s]) => document.querySelector(`[data-pad="${n}"]`)?.getAttribute('data-state') === s,
    [n, state],
    { timeout: 3000 },
  ).catch(async () => {
    const got = await page.locator(`[data-pad="${n}"]`).getAttribute('data-state');
    throw new Error(`pad ${n}: se esperaba "${state}", llegó "${got}"`);
  });
}

async function withMic() {
  const browser = await launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(URL);
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.locator('[data-pad="1"]').waitFor();

  const midi = await page.locator('[data-midi-status]').textContent();
  if (!/LPD8|navegador|MIDI/.test(midi || '')) throw new Error(`indicador MIDI inesperado: ${midi}`);

  await holdPad(page, 1, 50);
  await expectState(page, 1, 'recording');
  await page.waitForTimeout(1000);
  await holdPad(page, 1, 50);
  await expectState(page, 1, 'playing');
  await expectState(page, 8, 'on'); // grabar abrió el micro
  // En "Aprender", tocar pads en pantalla no debe silenciar ni borrar loops.
  await page.getByRole('button', { name: 'Aprender' }).click();
  await holdPad(page, 2, 50); // elige pad2 como objetivo
  await holdPad(page, 1, 1200);
  await expectState(page, 1, 'playing');
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await holdPad(page, 1, 1200);
  await expectState(page, 1, 'empty');
  // Paso 2: al revés alterna, stutter mientras se mantiene, perillas y selector de micro.
  await holdPad(page, 5, 50);
  await expectState(page, 5, 'on');
  await holdPad(page, 5, 50);
  await expectState(page, 5, 'off');
  const box6 = await page.locator('[data-pad="6"]').boundingBox();
  await page.mouse.move(box6.x + 20, box6.y + 20);
  await page.mouse.down();
  await expectState(page, 6, 'on');
  await page.mouse.up();
  await expectState(page, 6, 'off');
  for (const k of [1, 2, 3, 4, 5, 6]) await page.locator(`[data-knob="${k}"]`).fill('127');
  await page.locator('[data-mic-select]').waitFor();
  if (await page.locator('.knob.soon').count() !== 1) throw new Error('solo la perilla 7 debe decir pronto');
  if (errors.length) throw new Error(`errores en la página: ${errors.join(' | ')}`);
  await browser.close();
  console.log('ok: con micrófono');
}

async function micDenied() {
  const browser = await launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('denegado', 'NotAllowedError'));
  });
  await page.goto(URL);
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.locator('[data-notice]').filter({ hasText: 'micrófono' }).waitFor({ timeout: 3000 });
  await holdPad(page, 8, 50);
  await expectState(page, 8, 'on');
  await browser.close();
  console.log('ok: micrófono negado');
}

let browsers = [];
const launch = async (opts) => { const b = await chromium.launch(opts); browsers.push(b); return b; };

async function micMissing() {
  const browser = await launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no hay', 'NotFoundError'));
  });
  await page.goto(URL);
  await page.getByRole('button', { name: 'Empezar' }).click();
  await page.locator('[data-notice]').filter({ hasText: 'No se encontró ningún micrófono' }).waitFor({ timeout: 3000 });
  await browser.close();
  console.log('ok: sin micrófono');
}

async function micSwitchFails() {
  const browser = await launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.addInitScript(() => {
    const md = navigator.mediaDevices;
    md.enumerateDevices = async () => [
      { kind: 'audioinput', deviceId: 'uno', label: 'Micro uno' },
      { kind: 'audioinput', deviceId: 'dos', label: 'Micro dos' },
    ];
    md.getUserMedia = async (c) => {
      if (c.audio.deviceId) throw new DOMException('no existe', 'OverconstrainedError');
      const ctx = new AudioContext();
      const d = ctx.createMediaStreamDestination();
      const track = d.stream.getAudioTracks()[0];
      track.getSettings = () => ({ deviceId: 'uno' });
      return d.stream;
    };
  });
  await page.goto(URL);
  await page.getByRole('button', { name: 'Empezar' }).click();
  const sel = page.locator('[data-mic-select]');
  await page.waitForFunction(() => document.querySelector('[data-mic-select]').options.length === 2);
  await sel.selectOption('dos');
  await page.locator('[data-notice]').filter({ hasText: 'No se encontró' }).waitFor({ timeout: 3000 });
  await page.waitForFunction(() => document.querySelector('[data-mic-select]').value === 'uno', null, { timeout: 3000 })
    .catch(() => { throw new Error('el selector debe regresar al micro que sí funciona'); });
  await browser.close();
  console.log('ok: cambio de micro fallido');
}

(async () => {
  const server = await startServer();
  try {
    await withMic();
    await micDenied();
    await micMissing();
    await micSwitchFails();
  } catch (e) {
    console.error('FALLO:', e.message);
    process.exitCode = 1;
  } finally {
    await Promise.all(browsers.map((b) => b.close().catch(() => {})));
    try { process.kill(-server.pid); } catch {}
  }
})();
