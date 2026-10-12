// Regia dell'interfaccia: schermata iniziale, ciclo di gioco, barra, mappa e comandi del giocatore.
import { createGame } from './sim/setup.js';
import { createRenderer } from './ui/renderer.js';
import { createCamera, toWorld, toScreen, zoomAt, pan, centerOn } from './ui/camera.js';
import { buildIndex, provinceAt, armyAt } from './ui/hit.js';
import { attachInput } from './ui/input.js';
import { createClock, tick, setSpeed, setPaused } from './ui/clock.js';
import { createSession, runDays, pausaNecessaria } from './ui/session.js';
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
  const r = runDays(ui.session, n);
  if (r.notizie.length) ui.notizie = [...ui.notizie, ...r.notizie].slice(-8);
  if (r.motivo) setPaused(ui.clock, true);
  aggiorna();
}

function togglePausa() {
  if (!ui.session) return;
  if (ui.clock.pausa && pausaNecessaria(ui.session)) return;
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
  const b = V.topBar(g, giocatore);
  for (const k of ['data', 'tesoro', 'entrate', 'uomini', 'stabilita', 'infamia']) $(`b-${k}`).textContent = b[k];
  $('b-pausa').textContent = ui.clock.pausa ? '▶' : '❚❚';
  $('b-vel').textContent = `velocità ${ui.clock.velocita}`;
  $('notizie').innerHTML = ui.notizie.map(t => `<div>${H.esc(t)}</div>`).join('');
}

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
    const prov = provinceAt(index, ...toWorld(ui.camera, x, y));
    if (!ui.session) { if (prov) scegli(game().province[prov].owner); return; }
    ui.selezione.provincia = prov;
    aggiorna();
  },
  onRightClick: () => {},
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

renderInizio();
requestAnimationFrame(frame);
