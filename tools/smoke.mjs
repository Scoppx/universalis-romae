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

// Jev finto e deterministico, per provare l'interfaccia senza rete né chiave.
async function fakeAsk({ questions }) {
  const answers = {};
  for (const [k, q] of Object.entries(questions)) {
    if (q.type === 'noul') { answers[k] = { type: 'noul', noul: 0.8 }; continue; }
    const keys = Object.keys(q.criteria);
    answers[k] = { type: 'choice', choice: keys.at(-1), probabilities: Object.fromEntries(keys.map((o, i) => [o, i === keys.length - 1 ? 0.75 : 0.25 / (keys.length - 1)])), confidence: 0.6 };
  }
  return { answers, usage: { input_tokens: 10, output_tokens: 1 } };
}

const server = await startServer(0, { ask: fakeAsk });
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
  await page.click('[data-modo="cultura"]');
  check(await page.evaluate(() => window.universalis.ui.modo) === 'cultura', 'modalità cultura');
  check((await page.locator('[data-modo="terreno"]').count()) === 0, 'la modalità terreno non c\'è più');
  await page.waitForFunction(() => window.universalis.rilievoPronto(), null, { timeout: 10000 }).catch(() => {});
  check(await page.evaluate(() => window.universalis.rilievoPronto()), 'rilievo caricato e disegnato');
  check(await page.evaluate(() => window.universalis.markers().length > 30), 'un soldatino per ogni esercito');
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
  check(await page.evaluate(() => window.universalis.ui.selezione.eserciti.length > 0), 'esercito selezionato');
  await clickProvince('veio', 'right');
  check(await page.evaluate(() => {
    const u = window.universalis.ui;
    return u.session.game.eserciti[u.selezione.eserciti[0]].percorso.at(-1) === 'veio';
  }), 'clic destro su Veio: esercito in marcia');
  await clickProvince('tarquinia', 'right'); // visibile e non in guerra con Roma
  check((await page.textContent('#avviso')) === 'nessun percorso', 'destinazione irraggiungibile: avviso');
  // il pannello si ridisegna mentre il gioco scorre: le scelte restano
  await page.evaluate(() => {
    const g = window.universalis.ui.session.game;
    g.province.veio.controller = 'roma'; // la capitale di Veio resta sua (Fidenae può cambiare padrone con un ultimatum)
  });
  await page.click('[data-scheda="guerre"]');
  await page.check('input[name^="chiedi-"][value="veio"]');
  // pausa con il bottone: la barra spaziatrice su una casella la toglierebbe
  await page.click('#b-pausa');
  await wait(400);
  await page.click('#b-pausa');
  check(await page.isChecked('input[name^="chiedi-"][value="veio"]'), 'la casella spuntata resta spuntata mentre il tempo scorre');
  // esercito selezionato che scompare
  await page.evaluate(() => {
    const u = window.universalis.ui;
    delete u.session.game.eserciti[u.selezione.eserciti[0]];
    window.universalis.avanza(1);
  });
  check(await page.evaluate(() => window.universalis.ui.selezione.eserciti.length === 0), 'esercito scomparso: selezione azzerata');

  // --- revisione finale: clic durante i ridisegni, errore di disegno che non ferma il ciclo
  await page.click('[data-scheda="eserciti"]');
  await page.evaluate(async () => {
    const { createArmy } = await import('/js/sim/state.js');
    const g = window.universalis.ui.session.game;
    g.proposte = {};
    createArmy(g, 'roma', 'roma', 1000, 0).morale = 0; // il morale che risale cambia il pannello ogni giorno
    window.universalis.avanza(1);
  });
  await page.click('#b-pausa');
  let presi = 0;
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => { window.universalis.ui.selezione.eserciti = []; });
    const b = await page.evaluate(() => {
      const r = document.querySelector('#scheda [data-azione="seleziona-esercito"]').getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.move(b.x, b.y);
    await page.mouse.down();
    await wait(120);
    await page.mouse.up();
    if (await page.evaluate(() => window.universalis.ui.selezione.eserciti.length > 0)) presi++;
  }
  await page.click('#b-pausa');
  check(presi === 8, `clic sui bottoni col gioco in corsa: ${presi}/8`);
  const disegni = await page.evaluate(async () => {
    const u = window.universalis.ui, p = u.session.game.province.roma, owner = p.owner;
    p.owner = 'atlantide';
    u.sporco = true;
    await new Promise(r => setTimeout(r, 100));
    p.owner = owner;
    const prima = u.disegni;
    u.sporco = true;
    await new Promise(r => setTimeout(r, 100));
    return [prima, u.disegni];
  });
  check(disegni[1] > disegni[0], `dopo un errore di disegno la mappa si ridisegna (${disegni.join(' → ')})`);

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

  // --- Jev nell'interfaccia (tappa 3)
  await page.goto(url);
  await page.waitForSelector('#inizio-lista .carta');
  // isDisabled di Playwright non vede la proprietà disabled delle <option>: si legge dal DOM
  const opzione = (pg, v) => pg.evaluate(val => document.querySelector(`#inizio-ia option[value="${val}"]`).disabled, v);
  await page.waitForFunction(() => document.getElementById('inizio-ia-nota').textContent.length > 0);
  check(!(await opzione(page, 'misto')), 'Jev disponibile: modalità misto selezionabile');
  await page.click('[data-popolo="volsci"]');
  await page.selectOption('#inizio-ia', 'misto');
  await page.click('#inizio-via');
  await page.waitForSelector('#barra:not([hidden])');
  check(await page.isVisible('[data-scheda="consiglio"]'), 'scheda Consiglio presente');
  await page.keyboard.press('5');
  await page.click('#b-pausa');
  await page.waitForFunction(() => window.universalis.ui.consiglio.length > 0, null, { timeout: 15000 }).catch(() => {});
  await page.click('#b-pausa').catch(() => {});
  await page.evaluate(() => { document.getElementById('finestra').hidden = true; });
  await page.click('[data-scheda="consiglio"]');
  check((await page.locator('#scheda .voto').count()) > 0, 'il Consiglio mostra le decisioni di Jev');
  check((await page.textContent('#scheda')).includes('%'), 'con le probabilità');
  await page.selectOption('#consiglio-filtro', 'roma');
  check(await page.evaluate(() => window.universalis.ui.filtroConsiglio === 'roma'), 'filtro per popolo');

  const senza = await startServer(0, { ask: null });
  const p2 = await context.newPage();
  await p2.goto(`http://127.0.0.1:${senza.address().port}/`);
  await p2.waitForSelector('#inizio-lista .carta');
  await p2.waitForFunction(() => document.getElementById('inizio-ia-nota').textContent.length > 0);
  check(await opzione(p2, 'jev'), 'senza chiave: modalità Jev disattivata');
  await p2.close();
  senza.close();

  // --- soldatini: selezione, rettangolo, unisci, dividi, marcia (tappa 2b)
  await page.goto(url);
  await page.waitForSelector('#inizio-lista .carta');
  await page.click('[data-popolo="roma"]');
  await page.selectOption('#inizio-ia', 'regole');
  await page.click('#inizio-via');
  await page.waitForSelector('#barra:not([hidden])');
  await page.evaluate(async () => {
    const { createArmy } = await import('/js/sim/state.js');
    const g = window.universalis.ui.session.game;
    createArmy(g, 'roma', 'roma', 800, 0);
    window.universalis.avanza(0);
  });
  await page.waitForFunction(n => window.universalis.markers().filter(m => m.owner === 'roma').length >= n, 2);
  const box = await page.locator('#mappa').boundingBox();
  const mie = await page.evaluate(() => window.universalis.markers().filter(m => m.owner === 'roma'));
  await page.mouse.click(box.x + mie[0].x, box.y + mie[0].y);
  check(await page.evaluate(() => window.universalis.ui.selezione.eserciti.length === 1), 'clic sul soldatino: selezionato');
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + mie[1].x, box.y + mie[1].y);
  await page.keyboard.up('Shift');
  check(await page.evaluate(() => window.universalis.ui.selezione.eserciti.length === 2), 'Maiuscolo+clic: due selezionati');
  await page.keyboard.press('Escape');
  const xs = mie.map(m => m.x), ys = mie.map(m => m.y);
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + Math.min(...xs) - 25, box.y + Math.min(...ys) - 25);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.max(...xs) + 25, box.y + Math.max(...ys) + 25, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  check(await page.evaluate(() => window.universalis.ui.selezione.eserciti.length >= 2), 'Maiuscolo+trascina: rettangolo seleziona');
  await page.click('[data-scheda="eserciti"]');
  await page.click('[data-azione="unisci"]');
  check(await page.evaluate(() => Object.values(window.universalis.ui.session.game.eserciti).filter(e => e.owner === 'roma').length === 1), 'unisci: un solo esercito');
  check(await page.evaluate(() => window.universalis.ui.selezione.eserciti.length === 1), 'dopo l\'unione resta selezionato');
  await page.click('[data-azione="dividi"]');
  check(await page.evaluate(() => Object.values(window.universalis.ui.session.game.eserciti).filter(e => e.owner === 'roma').length === 2), 'dividi: due eserciti');
  await page.evaluate(async () => {
    const { declareWar } = await import('/js/sim/war.js');
    const g = window.universalis.ui.session.game;
    g.proposte = {}; // una proposta al giocatore fermerebbe il tempo
    declareWar(g, 'roma', 'veio');
  });
  await clickProvince('veio', 'right');
  check(await page.evaluate(() => window.universalis.ui.selezione.eserciti.every(id => window.universalis.ui.session.game.eserciti[id].percorso.at(-1) === 'veio')), 'clic destro: tutti i selezionati in marcia');
  const xPrima = await page.evaluate(() => window.universalis.markers().find(m => m.id === window.universalis.ui.selezione.eserciti[0]).x);
  await page.keyboard.press('1');
  await page.click('#b-pausa');
  await wait(1500);
  await page.click('#b-pausa');
  const xDopo = await page.evaluate(() => window.universalis.markers().find(m => m.id === window.universalis.ui.selezione.eserciti[0]).x);
  check(Math.abs(xDopo - xPrima) > 1, `il soldatino cammina (${xPrima.toFixed(1)} → ${xDopo.toFixed(1)})`);
  await page.screenshot({ path: 'smoke-truppe.png' });

  // --- diplomazia (tappa 4a)
  await page.goto(url);
  await page.waitForSelector('#inizio-lista .carta');
  await page.click('[data-popolo="roma"]');
  await page.selectOption('#inizio-ia', 'regole');
  await page.click('#inizio-via');
  await page.waitForSelector('#barra:not([hidden])');
  await page.click('[data-scheda="diplomazia"]');
  check((await page.textContent('#scheda')).includes('Confinanti'), 'diplomazia: confinanti in cima');
  check(await page.isDisabled('[data-azione="foedus"][data-id="veio"]'), 'foedus spento con il motivo');
  check((await page.getAttribute('[data-azione="foedus"][data-id="veio"]', 'title')).length > 0, 'il motivo è nel titolo del bottone');
  await page.evaluate(() => { window.universalis.ui.session.game.nazioni.roma.tesoro = 50; window.universalis.avanza(0); });
  await page.click('[data-azione="ambasceria"][data-id="veio"]');
  check(await page.evaluate(() => window.universalis.ui.session.game.nazioni.roma.relazioni.veio) === 25, 'ambasceria: relazione con Veio a 25');
  await page.click('[data-azione="alleanza"][data-id="lega_latina"]');
  check(await page.evaluate(() => Object.values(window.universalis.ui.session.game.proposte).some(p => p.tipo === 'alleanza' && p.a === 'lega_latina')), 'alleanza proposta ai Latini');
  const seconda = await page.evaluate(() => document.querySelector('#ult-lega_latina').options[1].value);
  await page.selectOption('#ult-lega_latina', seconda);
  await page.evaluate(async () => {
    const { changeRelation } = await import('/js/sim/diplomacy.js');
    changeRelation(window.universalis.ui.session.game, 'roma', 'lega_latina', 3); // il pannello si ridisegna
    window.universalis.avanza(0);
  });
  check(await page.evaluate(() => document.querySelector('#ult-lega_latina').value) === seconda, 'il menu dell\'ultimatum resta sulla provincia scelta');
  await page.evaluate(async () => {
    const { propose } = await import('/js/sim/diplomacy.js');
    const g = window.universalis.ui.session.game;
    g.proposte = {};
    propose(g, 'veio', 'tributo', 'roma');
    window.universalis.avanza(1);
  });
  check((await page.textContent('#finestra')).includes('Tributo'), 'proposta di tributo al giocatore: finestra');
  await page.click('[data-azione="rispondi"][data-accetta="0"]');
  check(await page.evaluate(() => window.universalis.ui.session.game.nazioni.veio.pretesti.roma > 0), 'tributo rifiutato: Veio ha un pretesto');
  await page.evaluate(() => { const g = window.universalis.ui.session.game; g.nazioni.roma.protettore = 'lega_latina'; window.universalis.avanza(0); });
  check(await page.isDisabled('[data-azione="dichiara"][data-id="veio"]'), 'da federato non si dichiara guerra');
  await page.click('[data-azione="esci"][data-id="lega_latina"]');
  check(await page.evaluate(() => window.universalis.ui.session.game.nazioni.roma.protettore === null), 'esci dal foedus: di nuovo liberi');
  await page.click('[data-modo="relazioni"]');
  await page.screenshot({ path: 'smoke-diplomazia.png' });

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
