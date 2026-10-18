// Regia dell'interfaccia: schermata iniziale, ciclo di gioco, barra, mappa e comandi del giocatore.
import { createGame } from './sim/setup.js';
import { applyCommand } from './sim/commands.js';
import { provincesOf } from './sim/state.js';
import { atWar } from './sim/war.js';
import { createJevAi } from './ai/jev.js';
import { createRenderer } from './ui/renderer.js';
import { createCamera, toWorld, toScreen, zoomAt, pan, centerOn } from './ui/camera.js';
import { buildIndex, provinceAt, armyAt } from './ui/hit.js';
import { armiesInRect } from './ui/armies-view.js';
import { attachInput } from './ui/input.js';
import { createClock, tick, setSpeed, setPaused, frazione } from './ui/clock.js';
import { createSession, runDays, pausaNecessaria } from './ui/session.js';
import { serialize, deserialize, writeStorage, readStorage, AUTOSAVE_KEY } from './ui/save.js';
import * as V from './ui/views.js';
import * as H from './ui/panels.js';
import { validateEvents } from './sim/validate-events.js';

const $ = id => document.getElementById(id);

async function loadData() {
  const get = f => fetch(`data/${f}`).then(r => {
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.json();
  });
  const EVENTI_FILE = ['generici', 'governo', 'storici', 'dormienti']; // come tools/load-data.js
  const [map, popoli, balance, ...eventi] = await Promise.all(
    ['map.json', 'popoli.json', 'balance.json', ...EVENTI_FILE.map(f => `eventi/${f}.json`)].map(get));
  const data = { map, popoli, balance, catalogo: eventi.flatMap(f => f.eventi) };
  // un catalogo sbagliato ferma il gioco prima che parta
  const errori = validateEvents(data.catalogo, data);
  if (errori.length) {
    document.body.style.whiteSpace = 'pre-wrap';
    document.body.textContent = `Eventi non validi:\n${errori.join('\n')}`;
    throw new Error('catalogo degli eventi non valido');
  }
  return data;
}

const data = await loadData();
const canvas = $('mappa');
const renderer = createRenderer(canvas, data.map, { onReady: () => { ui.sporco = true; } });
const index = buildIndex(data.map);
const cards = V.peopleCards(data.popoli, data.balance);
const caratteri = Object.fromEntries(data.popoli.popoli.map(p => [p.id, p.carattere]));

// Jev passa dal server, che tiene la chiave; nel browser non c'è mai.
async function askJev(body) {
  const r = await fetch('api/jev', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(out.errore || `HTTP ${r.status}`);
  return out;
}

function creaAi() {
  ui.consiglio = [];
  return createJevAi({
    ask: askJev, caratteri,
    onRecord: r => {
      ui.consiglio.push(r);
      if (ui.consiglio.length > 300) ui.consiglio.shift();
      if (r.errore && !ui.jevAvvisato) { ui.jevAvvisato = true; avviso(`Jev non risponde (${r.errore}): decidono le regole.`); }
    }
  });
}
const centroDi = id => data.map.province.find(p => p.id === id).centro;

const ui = {
  session: null,
  anteprima: createGame({ ...data, seed: 1 }),
  scelto: null,
  selezione: { provincia: null, eserciti: [] }, rettangolo: null,
  modo: 'politica', scheda: 'governo',
  clock: createClock(), camera: null, size: { w: 0, h: 0 },
  notizie: [], sporco: true, disegni: 0, premuto: false,
  consiglio: [], filtroConsiglio: null, jevAvvisato: false
};
window.universalis = {
  ui, data, toScreen: (x, y) => toScreen(ui.camera, x, y), avanza: n => avanza(n),
  markers: () => renderer.markers(), assedi: () => renderer.assedi(), rilievoPronto: () => renderer.rilievoPronto()
};

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
  $('inizio-via').title = c ? 'Inizia la partita con il popolo scelto' : 'Scegli prima un popolo.';
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
  const ia = $('inizio-ia').value;
  avvia(createSession(data, ui.scelto, seme, ia, ia === 'regole' ? null : creaAi()));
});

// senza Jev (server senza chiave, o sito statico senza server) si gioca solo con le regole
function senzaJev(nota) {
  for (const v of ['jev', 'misto']) {
    const o = $('inizio-ia').querySelector(`option[value="${v}"]`);
    o.disabled = true;
    o.title = nota;
  }
  $('inizio-ia').value = 'regole';
  $('inizio-ia-nota').textContent = nota;
}

fetch('api/jev').then(r => { if (!r.ok) throw new Error(`api/jev: ${r.status}`); return r.json(); }).then(({ disponibile }) => {
  if (disponibile) { $('inizio-ia-nota').textContent = 'Jev disponibile.'; return; }
  senzaJev('Jev non disponibile: avvia il server con TYPESAFE_API_KEY per usarlo.');
}).catch(() => senzaJev('Jev non disponibile in questa versione: gli altri popoli giocano con le regole.'));

function avvia(session) {
  ui.session = session;
  ui.scelto = null;
  ui.selezione = { provincia: null, eserciti: [] };
  ui.notizie = [];
  ui.battaglie = {}; // per provincia: inizio, uomini del giorno prima, caduti
  ui.esiti = [];     // esiti di battaglia da mostrare per qualche secondo
  ui.jevAvvisato = false;
  ui.clock.accumulo = 0; // una partita nuova parte dall'inizio del giorno
  if (!session.ai) ui.consiglio = [];
  document.querySelector('[data-scheda="consiglio"]').hidden = !session.ai;
  if (!session.ai && ui.scheda === 'consiglio') ui.scheda = 'governo';
  setPaused(ui.clock, true);
  $('finestra').hidden = true; // una finestra della partita precedente non vale per la nuova
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
  const r = runDays(ui.session, n, { onYear: s => writeStorage(storage(), AUTOSAVE_KEY, serialize(s)), onLog: raccogliEsiti });
  if (r.notizie.length) ui.notizie = [...ui.notizie, ...r.notizie].slice(-8);
  if (r.motivo) {
    setPaused(ui.clock, true);
    mostraPausa(r.motivo);
  }
  aggiorna();
}

// Esiti delle battaglie dei tuoi eserciti (e delle tue ritirate): restano in alto 4 secondi.
function raccogliEsiti(log) {
  const g = ui.session.giocatore, game = ui.session.game;
  for (const e of log) {
    const mia = e.tipo === 'battaglia' && (ui.battaglie[e.prov] || e.vincitore === g || e.sconfitto === g);
    if (!mia && !(e.tipo === 'ritirata' && e.nazione === g)) continue;
    const vinto = e.tipo === 'battaglia' && !atWar(game, g, e.vincitore);
    ui.esiti.push({ prov: e.prov, nome: game.province[e.prov].nome, vinto,
      testo: e.tipo === 'ritirata' ? 'ritirata' : vinto ? 'vittoria' : 'sconfitta', fino: performance.now() + 4000 });
    delete ui.battaglie[e.prov];
    setTimeout(aggiorna, 4100);
  }
}

// I riquadri delle battaglie: giorni dall'inizio e caduti dall'ultimo aggiornamento.
function aggiornaBattaglie(game, g) {
  const list = V.battlesView(game, g);
  const viste = new Set(list.map(b => b.prov));
  for (const p of Object.keys(ui.battaglie)) if (!viste.has(p)) delete ui.battaglie[p];
  for (const b of list) {
    const r = ui.battaglie[b.prov] ??= { inizio: game.day, giorno: game.day, ieri: { miei: b.miei.uomini, nemici: b.nemici.uomini }, caduti: { miei: 0, nemici: 0 } };
    if (r.giorno !== game.day) {
      r.caduti = { miei: Math.max(0, r.ieri.miei - b.miei.uomini), nemici: Math.max(0, r.ieri.nemici - b.nemici.uomini) };
      r.ieri = { miei: b.miei.uomini, nemici: b.nemici.uomini };
      r.giorno = game.day;
    }
    b.giorni = game.day - r.inizio + 1;
    b.miei.caduti = r.caduti.miei;
    b.nemici.caduti = r.caduti.nemici;
  }
  const ora = performance.now();
  ui.esiti = ui.esiti.filter(e => e.fino > ora);
  setHtml($('battaglie'), H.battaglieHtml(list, ui.esiti));
}

function apriAssedio(prov) {
  const v = V.siegeView(ui.session.game, ui.session.giocatore, prov);
  if (!v) return;
  setPaused(ui.clock, true); // si decide a gioco fermo
  finestra(H.assedioHtml(v));
  aggiorna();
}

function mostraPausa(motivo) {
  const { game: g, giocatore } = ui.session;
  if (motivo === 'proposta') finestra(H.proposalHtml(V.pendingProposals(g, giocatore)[0]));
  else if (motivo === 'evento') {
    const [ev] = V.pendingEvents(g, giocatore);
    if (ev) finestra(H.eventoHtml(ev));
  }
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

// Il prossimo fotogramma si prenota per primo: un errore qui non deve fermare mappa e orologio per sempre.
function frame(now) {
  requestAnimationFrame(frame);
  try {
    if (ui.session) {
      const n = tick(ui.clock, now);
      if (n) avanza(n);
    }
    // si disegna a ogni fotogramma: i soldatini si muovono; la base della mappa resta in cache
    renderer.draw({
      game: game(), giocatore: ui.session?.giocatore ?? null, modo: ui.modo,
      selezione: ui.selezione, camera: ui.camera, evidenzia: ui.session ? null : ui.scelto,
      fraz: frazione(ui.clock), now, inPausa: ui.clock.pausa || !ui.session, rettangolo: ui.rettangolo
    });
    ui.sporco = false;
    ui.disegni++;
  } catch (e) {
    console.warn('fotogramma non riuscito', e);
  }
}

// --- pannelli

function aggiorna() {
  ui.sporco = true;
  if (!ui.session) return;
  const { game: g, giocatore } = ui.session;
  ui.selezione.eserciti = ui.selezione.eserciti.filter(id => g.eserciti[id]);
  const b = V.topBar(g, giocatore);
  for (const k of ['data', 'tesoro', 'entrate', 'uomini', 'stabilita', 'infamia']) $(`b-${k}`).textContent = b[k];
  $('b-pausa').textContent = ui.clock.pausa ? '▶' : '❚❚';
  $('b-vel').textContent = `velocità ${ui.clock.velocita}`;
  const attesa = ui.session.ai?.inAttesa?.() ?? 0;
  $('b-jev').hidden = !ui.session.ai;
  $('b-jev').textContent = attesa ? `Jev: ${attesa} in attesa` : 'Jev';
  $('notizie').innerHTML = ui.notizie.map(t => `<div>${H.esc(t)}</div>`).join('');
  setHtml($('provincia'), ui.selezione.provincia
    ? H.provinceHtml(V.provinceInfo(g, ui.selezione.provincia, giocatore))
    : '<p class="muto">Clic su una provincia per vederla.</p>');
  const schede = {
    governo: () => H.governoHtml(V.governmentView(g, giocatore)),
    diplomazia: () => H.diplomaziaHtml(V.diplomacyView(g, giocatore), V.coalitionWarning(g, giocatore)),
    eserciti: () => H.esercitiHtml(V.armiesView(g, giocatore, ui.selezione.eserciti), V.selectionActions(g, giocatore, ui.selezione.eserciti)),
    guerre: () => H.guerreHtml(V.warsView(g, giocatore)),
    consiglio: () => H.consiglioHtml(V.councilView(ui.consiglio, g, ui.filtroConsiglio),
      g.ordine.filter(id => id !== giocatore).map(id => ({ id, nome: g.nazioni[id].nome })), ui.filtroConsiglio)
  };
  setHtml($('scheda'), schede[ui.scheda]());
  aggiornaBottoniPace();
  aggiornaBattaglie(g, giocatore);
}

// I bottoni delle richieste di province si spengono, con il motivo, se le caselle spuntate non vanno bene.
function aggiornaBottoniPace() {
  for (const b of $('scheda').querySelectorAll('button[data-azione="chiedi"], button[data-azione="cedi"]')) {
    const owners = [...$('scheda').querySelectorAll(`input[name="${b.dataset.azione}-${b.dataset.id}"]:checked`)].map(i => i.dataset.owner);
    const conDenari = b.dataset.denariMax !== undefined;
    const denari = conDenari ? Math.max(0, Math.floor(Number(document.getElementById(`denari-${b.dataset.id}`)?.value) || 0)) : 0;
    const motivo = V.motivoRichiesta(owners, JSON.parse(b.dataset.limiti), denari, conDenari ? Number(b.dataset.denariMax) : null);
    b.disabled = Boolean(motivo);
    b.title = motivo ?? (b.dataset.azione === 'chiedi'
      ? 'Invia al nemico la proposta: le province spuntate e i denari indicati; se accetta, la guerra finisce'
      : 'Offri al nemico le tue province spuntate in cambio della pace');
  }
}
$('scheda').addEventListener('change', aggiornaBottoniPace);
$('scheda').addEventListener('input', aggiornaBottoniPace);

// Ridisegna solo se l'HTML cambia, e conserva caselle spuntate, numeri scritti e focus.
const ultimoHtml = new WeakMap();
function setHtml(el, html) {
  // con il mouse premuto sul pannello non si ridisegna: il bottone sotto il cursore deve ricevere il clic
  if (ui.premuto || ultimoHtml.get(el) === html) return;
  const spuntate = new Set([...el.querySelectorAll('input[type=checkbox]:checked')].map(i => `${i.name}=${i.value}`));
  const numeri = Object.fromEntries([...el.querySelectorAll('input[type=number], select')].map(i => [i.id, i.value]));
  const focus = el.contains(document.activeElement) ? document.activeElement.id : null;
  el.innerHTML = html;
  ultimoHtml.set(el, html);
  for (const i of el.querySelectorAll('input[type=checkbox]')) if (spuntate.has(`${i.name}=${i.value}`)) i.checked = true;
  for (const i of el.querySelectorAll('input[type=number], select')) {
    // un menu torna alla scelta fatta solo se quell'opzione c'è ancora
    if (numeri[i.id] !== undefined && (i.tagName !== 'SELECT' || [...i.options].some(o => o.value === numeri[i.id]))) i.value = numeri[i.id];
  }
  if (focus) document.getElementById(focus)?.focus();
}

// --- comandi del giocatore

let avvisoTimer = null;
function avviso(testo) {
  const el = $('avviso');
  el.textContent = testo;
  el.hidden = false;
  clearTimeout(avvisoTimer);
  avvisoTimer = setTimeout(() => { el.hidden = true; }, 6000); // abbastanza per leggere un motivo lungo
}

function comando(cmd) {
  const r = applyCommand(ui.session.game, { ...cmd, nazione: ui.session.giocatore });
  if (!r.ok) avviso(r.motivo);
  aggiorna();
  return r;
}

function selezionaEsercito(id, { centra = false, aggiungi = false } = {}) {
  const a = ui.session.game.eserciti[id];
  if (!a) return;
  ui.selezione.provincia = a.prov;
  const sel = ui.selezione.eserciti;
  if (a.owner !== ui.session.giocatore) { if (!aggiungi) ui.selezione.eserciti = []; }
  else if (aggiungi) ui.selezione.eserciti = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
  else ui.selezione.eserciti = [id];
  if (centra) centerOn(ui.camera, ui.size.w, ui.size.h, ...centroDi(a.prov));
  aggiorna();
}

// Province occupate da un alleato che il giocatore ha scelto di prendere per sé.
function assegnazioni(guerra, province) {
  const out = {};
  for (const sel of $('scheda').querySelectorAll(`select.assegna[data-guerra="${guerra}"]`)) {
    if (sel.value === 'io' && province.includes(sel.dataset.prov)) out[sel.dataset.prov] = ui.session.giocatore;
  }
  return Object.keys(out).length ? out : null;
}

function proponi(guerra, ricevente, province, denari = 0, assegna = null) {
  const r = comando({ tipo: 'proponi_pace', guerra, termini: { ricevente, province, ...(denari ? { denari } : {}), ...(assegna ? { assegna } : {}) } });
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
    case 'slider': comando({ tipo: 'slider', quale: el.dataset.quale, verso: Number(el.dataset.verso) }); break;
    case 'colonia': comando({ tipo: 'colonia', provincia: id }); break;
    case 'fortifica': comando({ tipo: 'fortifica', provincia: id }); break;
    case 'dichiara':
    case 'prepara-guerra':
      setPaused(ui.clock, true); // si decide a gioco fermo
      finestra(H.guerraConfermaHtml(V.warConfirmView(ui.session.game, ui.session.giocatore, id)));
      aggiorna();
      break;
    case 'conferma-guerra': {
      $('finestra').hidden = true;
      const r = comando({ tipo: 'dichiara_guerra', contro: id });
      if (r.ok) finestra(H.guerraRiepilogoHtml(V.warSummaryView(ui.session.game, ui.session.giocatore, r.guerra)));
      break;
    }
    case 'apri-diplomazia': document.querySelector('[data-scheda="diplomazia"]').click(); break;
    case 'ambasceria': comando({ tipo: 'ambasceria', verso: id }); break;
    case 'alleanza':
    case 'foedus':
    case 'tributo': {
      const r = comando({ tipo: 'proponi', genere: el.dataset.azione, verso: id });
      if (r.ok) avviso('Proposta inviata.');
      break;
    }
    case 'ultimatum': {
      const r = comando({ tipo: 'proponi', genere: 'ultimatum', verso: id, provincia: $(`ult-${id}`).value });
      if (r.ok) avviso('Ultimatum inviato.');
      break;
    }
    case 'rompi': comando({ tipo: 'rompi_alleanza', con: id }); break;
    case 'esci': comando({ tipo: 'esci_foedus' }); break;
    case 'seleziona-esercito': selezionaEsercito(id, { centra: true, aggiungi: e.shiftKey }); break;
    case 'unisci': {
      const r = comando({ tipo: 'unisci', eserciti: ui.selezione.eserciti });
      if (r.ok) { ui.selezione.eserciti = [r.esercito]; aggiorna(); }
      break;
    }
    case 'unisci-qui': {
      const v = V.provinceInfo(ui.session.game, id, ui.session.giocatore);
      if (v.unibili) { const r = comando({ tipo: 'unisci', eserciti: v.unibili }); if (r.ok) ui.selezione.eserciti = [r.esercito]; }
      break;
    }
    case 'sciogli': {
      const r = comando({ tipo: 'sciogli', eserciti: ui.selezione.eserciti });
      if (r.ok) { ui.selezione.eserciti = []; avviso('Eserciti sciolti: gli uomini sono tornati nella riserva.'); }
      break;
    }
    case 'sciogli-esercito': {
      const r = comando({ tipo: 'sciogli', eserciti: [id] });
      if (r.ok) ui.selezione.eserciti = ui.selezione.eserciti.filter(x => x !== id);
      break;
    }
    case 'assalto': {
      $('finestra').hidden = true;
      const r = comando({ tipo: 'assalto', provincia: id });
      if (r.ok) avviso(r.vinto ? `Assalto riuscito: ${ui.session.game.province[id].nome} è tua.` : 'Assalto respinto: hai perso uomini e morale, l\'assedio continua.');
      break;
    }
    case 'ripiega': {
      $('finestra').hidden = true;
      const r = comando({ tipo: 'ripiega', provincia: id });
      if (r.ok) avviso(`I tuoi eserciti lasciano l'assedio e marciano verso ${ui.session.game.province[r.verso].nome}.`);
      break;
    }
    case 'ritirata': {
      const r = comando({ tipo: 'ritirata', provincia: id });
      if (r.ok) { raccogliEsiti([{ tipo: 'ritirata', prov: id, nazione: ui.session.giocatore }]); aggiorna(); }
      break;
    }
    case 'riunisci': {
      const r = comando({ tipo: 'riunisci', eserciti: ui.selezione.eserciti });
      if (r.ok) avviso('Gli eserciti marciano per riunirsi.');
      break;
    }
    case 'dividi': {
      const [primo] = ui.selezione.eserciti;
      const r = comando({ tipo: 'dividi', esercito: primo });
      if (r.ok) { ui.selezione.eserciti = [primo, r.esercito]; aggiorna(); }
      break;
    }
    case 'chiedi':
    case 'cedi': {
      const province = [...document.querySelectorAll(`input[name="${el.dataset.azione}-${id}"]:checked`)].map(i => i.value);
      const denari = el.dataset.azione === 'chiedi' ? Math.max(0, Math.floor(Number($(`denari-${id}`)?.value) || 0)) : 0;
      if (!province.length && !denari) { avviso('Scegli almeno una provincia o dei denari.'); break; }
      proponi(id, el.dataset.azione === 'chiedi' ? ui.session.giocatore : el.dataset.nemico, province, denari,
        el.dataset.azione === 'chiedi' ? assegnazioni(id, province) : null);
      break;
    }
    case 'pace-bianca': proponi(id, ui.session.giocatore, []); break;
    case 'annetti': {
      const g = ui.session.game, popolo = el.dataset.popolo;
      const province = provincesOf(g, popolo).map(p => p.id), assegna = assegnazioni(id, province);
      const r = comando({ tipo: 'proponi_pace', guerra: id, termini: { ricevente: ui.session.giocatore, province, annessione: popolo, ...(assegna ? { assegna } : {}) } });
      if (r.ok) avviso('Proposta di annessione inviata.');
      break;
    }
    case 'rispondi': {
      $('finestra').hidden = true;
      comando({ tipo: 'rispondi', proposta: id, accetta: el.dataset.accetta === '1' });
      const motivo = pausaNecessaria(ui.session);
      if (motivo) mostraPausa(motivo);
      break;
    }
    case 'scegli': {
      $('finestra').hidden = true;
      comando({ tipo: 'scegli', evento: id, opzione: el.dataset.opzione });
      const motivo = pausaNecessaria(ui.session);
      if (motivo) mostraPausa(motivo);
      break;
    }
    case 'chiudi': $('finestra').hidden = true; break;
  }
});

$('pannello').addEventListener('pointerdown', () => { ui.premuto = true; });
// anche i riquadri delle battaglie si ridisegnano ogni giorno: con il mouse premuto restano fermi
$('battaglie').addEventListener('pointerdown', () => { ui.premuto = true; });
window.addEventListener('pointerup', () => {
  if (!ui.premuto) return;
  ui.premuto = false;
  setTimeout(aggiorna); // dopo il clic, che arriva subito dopo il rilascio
});

document.addEventListener('change', e => {
  if (e.target.id !== 'consiglio-filtro') return;
  ui.filtroConsiglio = e.target.value || null;
  aggiorna();
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
  onClick: (x, y, { shift } = {}) => {
    const assedio = ui.session && renderer.assedi().find(s => Math.hypot(s.x - x, s.y - y) <= 13);
    if (assedio) { apriAssedio(assedio.prov); return; }
    const army = ui.session && armyAt(renderer.markers(), x, y, 16);
    if (army) { selezionaEsercito(army, { aggiungi: shift }); return; }
    const prov = provinceAt(index, ...toWorld(ui.camera, x, y));
    if (!ui.session) { if (prov) scegli(game().province[prov].owner); return; }
    ui.selezione.provincia = prov;
    if (!shift) ui.selezione.eserciti = [];
    aggiorna();
  },
  onRightClick: (x, y) => {
    if (!ui.session || !ui.selezione.eserciti.length) return;
    const prov = provinceAt(index, ...toWorld(ui.camera, x, y));
    if (!prov) return;
    const falliti = [];
    for (const id of ui.selezione.eserciti) {
      const r = applyCommand(ui.session.game, { tipo: 'muovi', nazione: ui.session.giocatore, esercito: id, verso: prov });
      if (!r.ok) falliti.push(r.motivo);
    }
    if (falliti.length) avviso(falliti.length === ui.selezione.eserciti.length ? falliti[0] : `${falliti.length} eserciti non possono arrivarci`);
    aggiorna();
  },
  onBoxMove: r => { ui.rettangolo = r; },
  onBox: r => {
    ui.rettangolo = null;
    if (!ui.session) return;
    ui.selezione.eserciti = armiesInRect(renderer.markers(), r, ui.session.giocatore);
    aggiorna();
  },
  onKey: k => {
    if (!ui.session) return false;
    if (k === ' ') { togglePausa(); return true; }
    if (k === '+' || k === '=') { velocita(ui.clock.velocita + 1); return true; }
    if (k === '-') { velocita(ui.clock.velocita - 1); return true; }
    if (/^[1-5]$/.test(k)) { velocita(Number(k)); return true; }
    if (k === 'Escape') { ui.selezione = { provincia: null, eserciti: [] }; aggiorna(); return true; }
    return false;
  }
});

// --- salvataggi

function carica(text) {
  const r = deserialize(text, data, { creaAi });
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
