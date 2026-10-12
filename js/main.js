// Regia dell'interfaccia: schermata iniziale, ciclo di gioco, barra, mappa e comandi del giocatore.
import { createGame } from './sim/setup.js';
import { applyCommand } from './sim/commands.js';
import { createRenderer } from './ui/renderer.js';
import { createCamera, toWorld, toScreen, zoomAt, pan, centerOn } from './ui/camera.js';
import { buildIndex, provinceAt, armyAt } from './ui/hit.js';
import { attachInput } from './ui/input.js';
import { createClock, tick, setSpeed, setPaused } from './ui/clock.js';
import { createSession, runDays, pausaNecessaria } from './ui/session.js';
import { serialize, deserialize, writeStorage, readStorage, AUTOSAVE_KEY } from './ui/save.js';
import * as V from './ui/views.js';
import * as H from './ui/panels.js';

const $ = id => document.getElementById(id);

async function loadData() {
  const get = f => fetch(`data/${f}`).then(r => {
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.json();
  });
  const [map, popoli, balance] = await Promise.all(['map.json', 'popoli.json', 'balance.json'].map(get));
  return { map, popoli, balance };
}

const data = await loadData();
const canvas = $('mappa');
const renderer = createRenderer(canvas, data.map);
const index = buildIndex(data.map);
const cards = V.peopleCards(data.popoli);
const centroDi = id => data.map.province.find(p => p.id === id).centro;

const ui = {
  session: null,
  anteprima: createGame({ ...data, seed: 1 }),
  scelto: null,
  selezione: { provincia: null, esercito: null },
  modo: 'politica', scheda: 'governo',
  clock: createClock(), camera: null, size: { w: 0, h: 0 },
  notizie: [], sporco: true
};
window.universalis = { ui, data, toScreen: (x, y) => toScreen(ui.camera, x, y), avanza: n => avanza(n) };

const game = () => (ui.session ? ui.session.game : ui.anteprima);

function storage() {
  try { return window.localStorage; } catch { return null; }
}

function resize() {
  ui.size = renderer.resize();
  if (!ui.camera) {
    ui.camera = createCamera(ui.size.w, ui.size.h, data.map.width, data.map.height);
    pan(ui.camera, 220, 0); // la lista dei popoli copre la parte sinistra
  }
  ui.sporco = true;
}
new ResizeObserver(resize).observe(canvas);
resize();

// --- schermata iniziale

function renderInizio() {
  $('inizio-lista').innerHTML = H.cardsHtml(cards, ui.scelto);
  const c = cards.find(x => x.id === ui.scelto);
  $('inizio-scheda').innerHTML = c ? H.cardDetailHtml(c) : '<p class="muto">Nessun popolo scelto.</p>';
  $('inizio-via').disabled = !c;
  ui.sporco = true;
}

function scegli(id) {
  ui.scelto = id;
  renderInizio();
}

$('inizio-lista').addEventListener('click', e => {
  const el = e.target.closest('[data-popolo]');
  if (el) scegli(el.dataset.popolo);
});

$('inizio-via').addEventListener('click', () => {
  const seme = Math.max(1, Math.floor(Number($('inizio-seme').value) || 1));
  avvia(createSession(data, ui.scelto, seme));
});

function avvia(session) {
  ui.session = session;
  ui.scelto = null;
  ui.selezione = { provincia: null, esercito: null };
  ui.notizie = [];
  setPaused(ui.clock, true);
  $('inizio').hidden = true;
  $('barra').hidden = false;
  $('pannello').hidden = false;
  document.querySelector('main').classList.remove('senza-pannello');
  resize();
  ui.camera.scale = Math.min(ui.camera.max, (ui.camera.min / 0.8) * 3);
  centerOn(ui.camera, ui.size.w, ui.size.h, ...centroDi(session.game.nazioni[session.giocatore].capitale));
  aggiorna();
}

// --- tempo

function avanza(n) {
  if (!ui.session) return;
  const r = runDays(ui.session, n, { onYear: s => writeStorage(storage(), AUTOSAVE_KEY, serialize(s)) });
  if (r.notizie.length) ui.notizie = [...ui.notizie, ...r.notizie].slice(-8);
  if (r.motivo) {
    setPaused(ui.clock, true);
    mostraPausa(r.motivo);
  }
  aggiorna();
}

function mostraPausa(motivo) {
  const { game: g, giocatore } = ui.session;
  if (motivo === 'proposta') finestra(H.proposalHtml(V.pendingProposals(g, giocatore)[0]));
  else if (motivo === 'fine') finestra(H.rankingHtml('Fine della partita: 264 a.C.', V.rankingView(g, giocatore)));
  else if (motivo === 'sconfitta') finestra(H.rankingHtml('Il tuo popolo è scomparso', V.rankingView(g, giocatore)));
}

function finestra(html) {
  $('finestra-corpo').innerHTML = html;
  $('finestra').hidden = false;
}

function togglePausa() {
  if (!ui.session) return;
  if (ui.clock.pausa) {
    const motivo = pausaNecessaria(ui.session);
    if (motivo) { mostraPausa(motivo); return; }
  }
  setPaused(ui.clock, !ui.clock.pausa);
  aggiorna();
}

function velocita(v) {
  setSpeed(ui.clock, v);
  aggiorna();
}

function frame(now) {
  if (ui.session) {
    const n = tick(ui.clock, now);
    if (n) avanza(n);
  }
  if (ui.sporco) {
    renderer.draw({
      game: game(), giocatore: ui.session?.giocatore ?? null, modo: ui.modo,
      selezione: ui.selezione, camera: ui.camera, evidenzia: ui.session ? null : ui.scelto
    });
    ui.sporco = false;
  }
  requestAnimationFrame(frame);
}

// --- pannelli

function aggiorna() {
  ui.sporco = true;
  if (!ui.session) return;
  const { game: g, giocatore } = ui.session;
  if (ui.selezione.esercito && !g.eserciti[ui.selezione.esercito]) ui.selezione.esercito = null;
  const b = V.topBar(g, giocatore);
  for (const k of ['data', 'tesoro', 'entrate', 'uomini', 'stabilita', 'infamia']) $(`b-${k}`).textContent = b[k];
  $('b-pausa').textContent = ui.clock.pausa ? '▶' : '❚❚';
  $('b-vel').textContent = `velocità ${ui.clock.velocita}`;
  $('notizie').innerHTML = ui.notizie.map(t => `<div>${H.esc(t)}</div>`).join('');
  setHtml($('provincia'), ui.selezione.provincia
    ? H.provinceHtml(V.provinceInfo(g, ui.selezione.provincia, giocatore))
    : '<p class="muto">Clic su una provincia per vederla.</p>');
  const schede = {
    governo: () => H.governoHtml(V.governmentView(g, giocatore)),
    diplomazia: () => H.diplomaziaHtml(V.diplomacyView(g, giocatore)),
    eserciti: () => H.esercitiHtml(V.armiesView(g, giocatore), ui.selezione.esercito),
    guerre: () => H.guerreHtml(V.warsView(g, giocatore))
  };
  setHtml($('scheda'), schede[ui.scheda]());
}

// Ridisegna solo se l'HTML cambia, e conserva caselle spuntate, numeri scritti e focus.
const ultimoHtml = new WeakMap();
function setHtml(el, html) {
  if (ultimoHtml.get(el) === html) return;
  const spuntate = new Set([...el.querySelectorAll('input[type=checkbox]:checked')].map(i => `${i.name}=${i.value}`));
  const numeri = Object.fromEntries([...el.querySelectorAll('input[type=number]')].map(i => [i.id, i.value]));
  const focus = el.contains(document.activeElement) ? document.activeElement.id : null;
  el.innerHTML = html;
  ultimoHtml.set(el, html);
  for (const i of el.querySelectorAll('input[type=checkbox]')) if (spuntate.has(`${i.name}=${i.value}`)) i.checked = true;
  for (const i of el.querySelectorAll('input[type=number]')) if (numeri[i.id] !== undefined) i.value = numeri[i.id];
  if (focus) document.getElementById(focus)?.focus();
}

// --- comandi del giocatore

let avvisoTimer = null;
function avviso(testo) {
  const el = $('avviso');
  el.textContent = testo;
  el.hidden = false;
  clearTimeout(avvisoTimer);
  avvisoTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

function comando(cmd) {
  const r = applyCommand(ui.session.game, { ...cmd, nazione: ui.session.giocatore });
  if (!r.ok) avviso(r.motivo);
  aggiorna();
  return r;
}

function selezionaEsercito(id, centra) {
  const a = ui.session.game.eserciti[id];
  if (!a) return;
  ui.selezione.esercito = a.owner === ui.session.giocatore ? id : null;
  ui.selezione.provincia = a.prov;
  if (centra) centerOn(ui.camera, ui.size.w, ui.size.h, ...centroDi(a.prov));
  aggiorna();
}

function proponi(guerra, ricevente, province) {
  const r = comando({ tipo: 'proponi_pace', guerra, termini: { ricevente, province } });
  if (r.ok) avviso('Proposta inviata.');
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-azione]');
  if (!el || !ui.session) return;
  const id = el.dataset.id;
  switch (el.dataset.azione) {
    case 'recluta':
      comando({
        tipo: 'recluta', provincia: id,
        fanteria: Math.floor(Number($('r-fanti').value) || 0),
        cavalleria: Math.floor(Number($('r-cavalieri').value) || 0)
      });
      break;
    case 'alza-stabilita': comando({ tipo: 'alza_stabilita' }); break;
    case 'dichiara': comando({ tipo: 'dichiara_guerra', contro: id }); break;
    case 'seleziona-esercito': selezionaEsercito(id, true); break;
    case 'chiedi':
    case 'cedi': {
      const province = [...document.querySelectorAll(`input[name="${el.dataset.azione}-${id}"]:checked`)].map(i => i.value);
      if (!province.length) { avviso('Scegli almeno una provincia.'); break; }
      proponi(id, el.dataset.azione === 'chiedi' ? ui.session.giocatore : el.dataset.nemico, province);
      break;
    }
    case 'pace-bianca': proponi(id, ui.session.giocatore, []); break;
    case 'rispondi': {
      $('finestra').hidden = true;
      comando({ tipo: 'rispondi', proposta: id, accetta: el.dataset.accetta === '1' });
      const motivo = pausaNecessaria(ui.session);
      if (motivo) mostraPausa(motivo);
      break;
    }
    case 'chiudi': $('finestra').hidden = true; break;
  }
});

$('schede').addEventListener('click', e => {
  const b = e.target.closest('[data-scheda]');
  if (!b) return;
  ui.scheda = b.dataset.scheda;
  for (const x of $('schede').children) x.classList.toggle('attivo', x === b);
  aggiorna();
});

// --- comandi della barra

$('b-modi').addEventListener('click', e => {
  const b = e.target.closest('[data-modo]');
  if (!b) return;
  ui.modo = b.dataset.modo;
  for (const x of $('b-modi').children) x.classList.toggle('attivo', x === b);
  ui.sporco = true;
});
$('b-pausa').addEventListener('click', togglePausa);
$('b-meno').addEventListener('click', () => velocita(ui.clock.velocita - 1));
$('b-piu').addEventListener('click', () => velocita(ui.clock.velocita + 1));

// --- mappa

attachInput(canvas, {
  onPan: (dx, dy) => { pan(ui.camera, dx, dy); ui.sporco = true; },
  onZoom: (x, y, f) => { zoomAt(ui.camera, x, y, f); ui.sporco = true; },
  onClick: (x, y) => {
    const army = ui.session && armyAt(renderer.markers(), x, y);
    if (army) { selezionaEsercito(army, false); return; }
    const prov = provinceAt(index, ...toWorld(ui.camera, x, y));
    if (!ui.session) { if (prov) scegli(game().province[prov].owner); return; }
    ui.selezione.provincia = prov;
    aggiorna();
  },
  onRightClick: (x, y) => {
    if (!ui.session || !ui.selezione.esercito) return;
    const prov = provinceAt(index, ...toWorld(ui.camera, x, y));
    if (prov) comando({ tipo: 'muovi', esercito: ui.selezione.esercito, verso: prov });
  },
  onKey: k => {
    if (!ui.session) return false;
    if (k === ' ') { togglePausa(); return true; }
    if (k === '+' || k === '=') { velocita(ui.clock.velocita + 1); return true; }
    if (k === '-') { velocita(ui.clock.velocita - 1); return true; }
    if (/^[1-5]$/.test(k)) { velocita(Number(k)); return true; }
    if (k === 'Escape') { ui.selezione = { provincia: null, esercito: null }; aggiorna(); return true; }
    return false;
  }
});

// --- salvataggi

function carica(text) {
  const r = deserialize(text, data);
  if (!r.ok) { avviso(r.motivo); return; }
  avvia(r.session);
  avviso('Partita caricata.');
}

if (readStorage(storage(), AUTOSAVE_KEY)) $('inizio-continua').hidden = false;
$('inizio-continua').addEventListener('click', () => carica(readStorage(storage(), AUTOSAVE_KEY)));

$('b-esporta').addEventListener('click', () => {
  if (!ui.session) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([serialize(ui.session)], { type: 'application/json' }));
  a.download = `universalis-romae-${ui.session.giocatore}-giorno-${ui.session.game.day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

for (const input of document.querySelectorAll('input.importa')) {
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (file) carica(await file.text());
  });
}

renderInizio();
requestAnimationFrame(frame);
