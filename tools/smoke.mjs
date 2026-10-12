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

  // --- pannelli, eserciti e comandi (task 7)
  await clickProvince('roma');
  check((await page.textContent('#provincia h2')) === 'Roma', 'clic su Roma apre la sua scheda');
  const prima = await page.evaluate(() => Object.values(window.universalis.ui.session.game.eserciti).filter(a => a.owner === 'roma').reduce((s, a) => s + a.fanteria, 0));
  await page.fill('#r-fanti', '100');
  await page.fill('#r-cavalieri', '0');
  await page.click('[data-azione="recluta"]');
  const dopo = await page.evaluate(() => Object.values(window.universalis.ui.session.game.eserciti).filter(a => a.owner === 'roma').reduce((s, a) => s + a.fanteria, 0));
  check(dopo === prima + 100, `reclutamento: fanti ${prima} → ${dopo}`);
  await page.click('[data-scheda="diplomazia"]');
  await page.click('[data-azione="dichiara"][data-id="veio"]');
  await page.click('[data-scheda="guerre"]');
  check((await page.textContent('#scheda')).includes('Contro Veio'), 'guerra a Veio nella scheda Guerre');
  await page.click('[data-scheda="eserciti"]');
  await page.click('#scheda [data-azione="seleziona-esercito"]');
  check(await page.evaluate(() => Boolean(window.universalis.ui.selezione.esercito)), 'esercito selezionato');
  await clickProvince('veio', 'right');
  check(await page.evaluate(() => {
    const u = window.universalis.ui;
    return u.session.game.eserciti[u.selezione.esercito].percorso.at(-1) === 'veio';
  }), 'clic destro su Veio: esercito in marcia');
  await clickProvince('tarquinia', 'right'); // visibile e non in guerra con Roma
  check((await page.textContent('#avviso')) === 'nessun percorso', 'destinazione irraggiungibile: avviso');
  // il pannello si ridisegna mentre il gioco scorre: le scelte restano
  await page.evaluate(() => {
    const g = window.universalis.ui.session.game;
    g.province.fidenae.controller = 'roma';
  });
  await page.click('[data-scheda="guerre"]');
  await page.check('input[name^="chiedi-"][value="fidenae"]');
  // pausa con il bottone: la barra spaziatrice su una casella la toglierebbe
  await page.click('#b-pausa');
  await wait(400);
  await page.click('#b-pausa');
  check(await page.isChecked('input[name^="chiedi-"][value="fidenae"]'), 'la casella spuntata resta spuntata mentre il tempo scorre');
  // esercito selezionato che scompare
  await page.evaluate(() => {
    const u = window.universalis.ui;
    delete u.session.game.eserciti[u.selezione.esercito];
    window.universalis.avanza(1);
  });
  check(await page.evaluate(() => window.universalis.ui.selezione.esercito === null), 'esercito scomparso: selezione azzerata');

  // --- proposte, fine partita, salvataggi (task 8)
  await page.evaluate(async () => {
    const { declareWar, proposePeace } = await import('/js/sim/war.js');
    const g = window.universalis.ui.session.game;
    g.proposte = {};
    const { guerra } = declareWar(g, 'caere', 'roma');
    proposePeace(g, 'caere', guerra, { ricevente: 'caere', province: [] });
    window.universalis.avanza(1);
  });
  check(await page.isVisible('#finestra'), 'proposta al giocatore: finestra aperta');
  check((await page.textContent('#finestra')).includes('pace bianca'), 'testo della proposta');
  await page.click('[data-azione="rispondi"][data-accetta="1"]');
  check(await page.isHidden('#finestra'), 'risposta data: finestra chiusa');
  check(await page.evaluate(() => !Object.values(window.universalis.ui.session.game.guerre).some(w => w.attaccanti.includes('caere'))), 'pace con Caere firmata');

  await page.evaluate(() => {
    const u = window.universalis.ui;
    const fine = u.session.game.day + 400;
    while (u.session.game.day < fine) {
      u.session.game.proposte = {};
      window.universalis.avanza(fine - u.session.game.day);
    }
    document.getElementById('finestra').hidden = true;
  });
  check(await page.evaluate(() => Boolean(localStorage.getItem('universalis-romae:autosave'))), 'salvataggio automatico a capodanno');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#b-esporta')]);
  check(/^universalis-romae-roma-giorno-\d+\.json$/.test(download.suggestedFilename()), `esporta: ${download.suggestedFilename()}`);

  const dataPrima = await page.textContent('#b-data');
  await page.setInputFiles('#barra input.importa', { name: 'rotto.json', mimeType: 'application/json', buffer: Buffer.from('boh') });
  // la lettura del file è asincrona: si aspetta l'avviso
  const avvisato = await page.waitForFunction(() => document.getElementById('avviso').textContent.includes('non valido'), null, { timeout: 2000 }).then(() => true, () => false);
  check(avvisato, `importazione di un file rotto: avviso (${await page.textContent('#avviso')})`);
  check((await page.textContent('#b-data')) === dataPrima, 'importazione fallita: la partita resta');

  await page.reload();
  await page.waitForSelector('#inizio-continua:not([hidden])');
  await page.click('#inizio-continua');
  await page.waitForSelector('#barra:not([hidden])');
  check((await page.textContent('#b-data')) !== '21 aprile 753 a.C. (AUC 1)', 'Continua riprende la partita salvata');

  await page.evaluate(async () => {
    const { END_DAY } = await import('/js/sim/calendar.js');
    window.universalis.ui.session.game.proposte = {};
    window.universalis.ui.session.game.day = END_DAY - 1;
    window.universalis.avanza(1);
  });
  check((await page.textContent('#finestra')).includes('Fine della partita'), 'al 264 a.C. compare la classifica');
  await page.click('[data-azione="chiudi"]');

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
