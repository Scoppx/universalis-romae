// Prova di fumo nel browser: avvia il server, apre il gioco in Chromium headless e controlla i passaggi base.
// Uso: npm run smoke (usa il Chromium di Playwright in cache, oppure CHROME_PATH).
import { chromium } from 'playwright-core';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { startServer } from '../server.js';

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(homedir(), 'Library/Caches/ms-playwright');
  const dirs = existsSync(base) ? readdirSync(base).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const d of dirs) {
    for (const sub of readdirSync(path.join(base, d))) {
      const exe = path.join(base, d, sub, 'chrome-headless-shell');
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error('Chromium non trovato: imposta CHROME_PATH');
}

const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

const server = await startServer(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: chromePath() });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Clic sullo schermo nel punto della mappa dove sta il centro di una provincia.
async function clickProvince(id, button = 'left') {
  const [x, y] = await page.evaluate(pid => {
    const p = window.universalis.data.map.province.find(q => q.id === pid);
    return window.universalis.toScreen(...p.centro);
  }, id);
  const box = await page.locator('#mappa').boundingBox();
  await page.mouse.click(box.x + x, box.y + y, { button });
}

try {
  await page.goto(url);
  await page.waitForSelector('#inizio-lista .carta');

  // --- schermata iniziale e orologio (task 6)
  check((await page.locator('#inizio-lista .carta').count()) === 38, '38 popoli nella schermata iniziale');
  await page.click('[data-popolo="roma"]');
  check((await page.textContent('#inizio-scheda')).includes('facile'), 'Roma risulta facile');
  check(!(await page.isDisabled('#inizio-via')), 'Inizia attivo dopo la scelta');
  await page.screenshot({ path: 'smoke-inizio.png' });
  await page.click('#inizio-via');
  await page.waitForSelector('#barra:not([hidden])');
  check((await page.textContent('#b-data')) === '21 aprile 753 a.C. (AUC 1)', 'data iniziale nella barra');
  check(await page.isHidden('#inizio'), 'schermata iniziale chiusa');
  await page.keyboard.press('5');
  check((await page.textContent('#b-vel')) === 'velocità 5', 'tasto 5: velocità massima');
  await page.keyboard.press(' ');
  await wait(1200);
  await page.keyboard.press(' ');
  const giorno = await page.evaluate(() => window.universalis.ui.session.game.day);
  check(giorno >= 10, `il tempo scorre (giorno ${giorno})`);
  await wait(300);
  check(await page.evaluate(() => window.universalis.ui.session.game.day) === giorno, 'la pausa ferma il tempo');
  await page.click('[data-modo="terreno"]');
  check(await page.evaluate(() => window.universalis.ui.modo) === 'terreno', 'modalità terreno');
  await page.click('[data-modo="politica"]');

  // @@ controlli successivi @@
  await page.screenshot({ path: 'smoke-gioco.png' });
} catch (e) {
  failures.push(`eccezione: ${e.message}`);
  console.log(`FAIL eccezione: ${e.message}`);
} finally {
  check(errors.length === 0, `nessun errore in console${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error(`\n${failures.length} controlli falliti`);
  process.exit(1);
}
console.log('\nsmoke ok');
