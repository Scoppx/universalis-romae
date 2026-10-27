// Salvataggi: file JSON esportabili e salvataggio automatico nel browser.
import { END_DAY } from '../sim/calendar.js';
import { createSessionFrom } from './session.js';
import { initDiplomacy } from '../sim/diplomacy.js';
import { initGovernment, SLIDER } from '../sim/government.js';
import { initCulture, ensureRebels } from '../sim/culture.js';
import { RIBELLI } from '../sim/state.js';
import { initAmbitions } from '../sim/ambitions.js';

export const SAVE_VERSION = 1;
export const AUTOSAVE_KEY = 'universalis-romae:autosave';

// Il bilanciamento, le ambizioni e il catalogo degli eventi non si salvano: al caricamento valgono quelli correnti.
export function serialize(session) {
  const { balance, ambizioni, catalogo, ...game } = session.game;
  return JSON.stringify({ versione: SAVE_VERSION, giocatore: session.giocatore, seme: session.seme, ia: session.ia, game });
}

export function deserialize(text, data, { creaAi } = {}) {
  let s;
  try { s = JSON.parse(text); } catch { return { ok: false, motivo: 'file non valido: non è un salvataggio' }; }
  if (!s || s.versione !== SAVE_VERSION || typeof s.game !== 'object' || !s.game) {
    return { ok: false, motivo: 'file non valido: non è un salvataggio di Universalis Romae (o è di un\'altra versione)' };
  }
  const ia = s.ia ?? 'regole';
  if (!['regole', 'jev', 'misto'].includes(ia)) return { ok: false, motivo: 'salvataggio non valido: modalità IA sconosciuta' };
  const errore = validateGame(s, data);
  if (errore) return { ok: false, motivo: `salvataggio non valido: ${errore}` };
  const g = { ...s.game, balance: data.balance, ambizioni: data.ambizioni ?? null, catalogo: [...(data.catalogo ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1)) };
  initDiplomacy(g); // i salvataggi precedenti alla diplomazia ricevono i valori iniziali
  initGovernment(g);
  initAmbitions(g);
  initCulture(g);
  const info = Object.fromEntries(data.popoli.popoli.map(p => [p.id, p]));
  for (const id of g.ordine) g.nazioni[id].difficolta ??= info[id]?.difficolta ?? 'normale';
  g.giocatore ??= s.giocatore;
  g.sfida ??= 'normale';
  g.eventi ??= {};
  // eventi tolti dal catalogo o di popoli scomparsi: si scartano subito, prima che possano fermare il gioco
  for (const e of Object.values(g.eventi)) {
    if (!g.catalogo.some(d => d.id === e.evento) || !g.nazioni[e.nazione]?.vivo) delete g.eventi[e.id];
  }
  g.eventiFatti ??= {};
  // i salvataggi precedenti agli eventi ricevono i dormienti non ancora in partita
  g.dormienti ??= Object.fromEntries(data.popoli.popoli.filter(p => p.dormiente && !g.nazioni[p.id]).map(p =>
    [p.id, { id: p.id, nome: p.nome, colore: p.colore, cultura: p.cultura, governo: p.governo, capitale: p.capitale, tratti: { ...p.tratti }, difficolta: p.difficolta ?? 'normale' }]));
  for (const d of Object.values(g.dormienti)) d.difficolta ??= info[d.id]?.difficolta ?? 'normale';
  // il record dei ribelli non viene dal file: si ricrea sempre uguale
  if (g.nazioni[RIBELLI]) { delete g.nazioni[RIBELLI]; ensureRebels(g); }
  // senza creaAi una partita Jev riparte con le regole
  const ai = ia !== 'regole' && creaAi ? creaAi() : null;
  return { ok: true, session: createSessionFrom(g, s.giocatore, s.seme, ai ? ia : 'regole', ai) };
}

// Un file importato è input non fidato: ogni id, riferimento e numero letto dalla simulazione
// o dall'interfaccia viene controllato prima che la partita in corso venga sostituita.
const ID = /^[a-z0-9_]+$/;
const own = (o, k) => o !== null && typeof o === 'object' && Object.hasOwn(o, k);
const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const isInt = n => Number.isInteger(n);
const isNum = n => typeof n === 'number' && Number.isFinite(n);
const isStr = v => typeof v === 'string';

function validateGame(s, data) {
  const g = s.game;
  const ids = data.map.province.map(p => p.id);
  if (!isObj(g.province) || Object.keys(g.province).length !== ids.length || ids.some(id => !own(g.province, id))) return 'la mappa è diversa';
  if (!isInt(g.day) || g.day < 0 || g.day > END_DAY) return 'data impossibile';
  if (!isInt(g.rng) || !isInt(g.nextId) || !Array.isArray(g.log) || !Array.isArray(g.stretti) || !g.stretti.every(isStr)) return 'dati di base mancanti';
  if (!isObj(g.nazioni) || !Array.isArray(g.ordine)) return 'popoli mancanti';
  if (own(g.nazioni, RIBELLI) && !isObj(g.nazioni[RIBELLI])) return 'popolo ribelli';
  const nazioni = Object.keys(g.nazioni).filter(k => k !== RIBELLI);
  if (g.ordine.length !== nazioni.length || new Set(g.ordine).size !== nazioni.length || !g.ordine.every(id => own(g.nazioni, id))) return 'elenco dei popoli incoerente';
  if (!isStr(s.giocatore) || !own(g.nazioni, s.giocatore)) return 'popolo del giocatore sconosciuto';
  const nazione = id => isStr(id) && own(g.nazioni, id); // ribelli compresi: eserciti e controllori
  const attiva = id => isStr(id) && g.ordine.includes(id); // solo i popoli veri
  const provincia = id => isStr(id) && own(g.province, id);
  for (const [k, n] of Object.entries(g.nazioni)) {
    if (k === RIBELLI) continue; // si ricrea al caricamento
    if (!ID.test(k) || !isObj(n) || n.id !== k) return `popolo ${k}`;
    if (![n.nome, n.colore, n.cultura, n.governo].every(isStr) || !provincia(n.capitale)) return `popolo ${k}`;
    if (![n.tesoro, n.uomini, n.stabilita, n.infamia].every(isNum) || typeof n.vivo !== 'boolean') return `popolo ${k}`;
    if (!isObj(n.tratti) || !Object.values(n.tratti).every(isNum)) return `popolo ${k}`;
    if (!isObj(n.tregue) || !Object.entries(n.tregue).every(([t, d]) => attiva(t) && isInt(d))) return `popolo ${k}`;
    if (n.obiettivo !== undefined && n.obiettivo !== null && !provincia(n.obiettivo)) return `popolo ${k}`;
    if (n.relazioni !== undefined && (!isObj(n.relazioni) || !Object.entries(n.relazioni).every(([o, v]) => attiva(o) && isNum(v)))) return `popolo ${k}`;
    if (n.alleati !== undefined && (!Array.isArray(n.alleati) || !n.alleati.every(attiva))) return `popolo ${k}`;
    if (n.protettore !== undefined && n.protettore !== null && !attiva(n.protettore)) return `popolo ${k}`;
    if (n.tributo !== undefined && n.tributo !== null && !(isObj(n.tributo) && attiva(n.tributo.a) && isInt(n.tributo.fine))) return `popolo ${k}`;
    if (n.slider !== undefined && !(isObj(n.slider) && SLIDER.every(q => isInt(n.slider[q]) && Math.abs(n.slider[q]) <= 5))) return `popolo ${k}`;
    if (n.difficolta !== undefined && !isStr(n.difficolta)) return `popolo ${k}`;
    if (n.coalizioneDal !== undefined && n.coalizioneDal !== null && !isInt(n.coalizioneDal)) return `popolo ${k}`;
    if (n.foedusDal !== undefined && n.foedusDal !== null && !isInt(n.foedusDal)) return `popolo ${k}`;
    if (n.orda !== undefined && n.orda !== null && !(isObj(n.orda) && data.ambizioni?.orde?.[k]?.regione === n.orda.regione &&
      (n.orda.prima === null || provincia(n.orda.prima)))) return `popolo ${k}`;
    if (n.ambizioneRaggiunta !== undefined && n.ambizioneRaggiunta !== null && !isInt(n.ambizioneRaggiunta)) return `popolo ${k}`;
    if (n.ultimoSlider !== undefined && n.ultimoSlider !== null && !isInt(n.ultimoSlider)) return `popolo ${k}`;
    for (const campo of ['pretesti', 'ambascerie', 'ultimatumInviati', 'ultimatumAccettati']) {
      if (n[campo] !== undefined && (!isObj(n[campo]) || !Object.entries(n[campo]).every(([o, v]) => attiva(o) && isInt(v)))) return `popolo ${k}`;
    }
  }
  for (const [k, p] of Object.entries(g.province)) {
    if (!isObj(p) || p.id !== k || !attiva(p.owner) || !nazione(p.controller)) return `provincia ${k}`;
    if (![p.nome, p.cultura, p.terreno].every(isStr) || ![p.tasse, p.uomini, p.fort].every(isInt)) return `provincia ${k}`;
    if (!Array.isArray(p.vicini) || !p.vicini.every(provincia)) return `provincia ${k}`;
    if (p.assimilazione !== undefined && !(isNum(p.assimilazione) && p.assimilazione >= 0 && p.assimilazione <= 100)) return `provincia ${k}`;
    if (p.assimilazioneDi !== undefined && !attiva(p.assimilazioneDi)) return `provincia ${k}`;
    if (p.colonia !== undefined && p.colonia !== null && !attiva(p.colonia)) return `provincia ${k}`;
    if (p.ribelliDal !== undefined && p.ribelliDal !== null && !(isInt(p.ribelliDal) && p.ribelliDal >= 0)) return `provincia ${k}`;
    if (p.assedio !== undefined && p.assedio !== null && !(isObj(p.assedio) && nazione(p.assedio.nazione) && isNum(p.assedio.punti) && p.assedio.punti >= 0 && p.assedio.punti <= 100)) return `provincia ${k}`;
  }
  if (!isObj(g.eserciti) || !isObj(g.guerre) || !isObj(g.proposte)) return 'dati mancanti';
  for (const [k, a] of Object.entries(g.eserciti)) {
    if (!ID.test(k) || !isObj(a) || a.id !== k || !nazione(a.owner) || !provincia(a.prov)) return `esercito ${k}`;
    if (!Array.isArray(a.percorso) || !a.percorso.every(provincia)) return `esercito ${k}`;
    if (![a.fanteria, a.cavalleria, a.giorniAlProssimo].every(isInt) || a.fanteria < 0 || a.cavalleria < 0) return `esercito ${k}`;
    if (!isNum(a.morale) || a.morale < 0 || typeof a.inBattaglia !== 'boolean') return `esercito ${k}`;
    if (a.unisciCon !== undefined && a.unisciCon !== null && !(isStr(a.unisciCon) && ID.test(a.unisciCon))) return `esercito ${k}`;
  }
  for (const [k, w] of Object.entries(g.guerre)) {
    if (!ID.test(k) || !isObj(w) || w.id !== k || !isInt(w.inizio) || !isNum(w.battaglie)) return `guerra ${k}`;
    if (![w.attaccanti, w.difensori].every(l => Array.isArray(l) && l.length > 0 && l.every(attiva))) return `guerra ${k}`;
  }
  const TIPI = ['pace', 'alleanza', 'foedus', 'tributo', 'ultimatum', 'chiamata'];
  for (const [k, p] of Object.entries(g.proposte)) {
    if (!ID.test(k) || !isObj(p) || p.id !== k || !TIPI.includes(p.tipo) || !isInt(p.giorno)) return `proposta ${k}`;
    if (!attiva(p.da) || !attiva(p.a)) return `proposta ${k}`;
    if ((p.tipo === 'pace' || p.tipo === 'chiamata') && !own(g.guerre, p.guerra)) return `proposta ${k}`;
    if (p.tipo === 'pace') {
      if (!isObj(p.termini) || !attiva(p.termini.ricevente)) return `proposta ${k}`;
      if (!Array.isArray(p.termini.province) || !p.termini.province.every(provincia)) return `proposta ${k}`;
      if (p.termini.annessione !== undefined && !attiva(p.termini.annessione)) return `proposta ${k}`;
      if (p.termini.denari !== undefined && !(isInt(p.termini.denari) && p.termini.denari >= 0)) return `proposta ${k}`;
      if (p.termini.assegna !== undefined && !(isObj(p.termini.assegna) && Object.entries(p.termini.assegna).every(([q, x]) => provincia(q) && attiva(x)))) return `proposta ${k}`;
    }
    if (p.tipo === 'ultimatum' && !provincia(p.provincia)) return `proposta ${k}`;
  }
  if (g.sfida !== undefined && !(isStr(g.sfida) && own(data.balance.sfida ?? {}, g.sfida))) return 'livello di sfida';
  if (g.giocatore !== undefined && g.giocatore !== null && g.giocatore !== s.giocatore) return 'giocatore incoerente';
  if (g.coalizioni !== undefined) {
    if (!isObj(g.coalizioni)) return 'coalizioni';
    for (const [k, c] of Object.entries(g.coalizioni)) {
      if (!attiva(k) || !isObj(c) || !Array.isArray(c.membri) || !c.membri.every(attiva) || !isInt(c.dal)) return `coalizione ${k}`;
    }
  }
  if (g.eventi !== undefined) {
    if (!isObj(g.eventi)) return 'eventi';
    for (const [k, e] of Object.entries(g.eventi)) {
      if (!ID.test(k) || !isObj(e) || e.id !== k || !isStr(e.evento) || !attiva(e.nazione) || !isInt(e.giorno)) return `evento ${k}`;
      if (e.altro !== null && !attiva(e.altro)) return `evento ${k}`;
    }
  }
  if (g.eventiFatti !== undefined && !(isObj(g.eventiFatti) && Object.values(g.eventiFatti).every(l => Array.isArray(l) && l.every(attiva)))) return 'eventi fatti';
  if (g.dormienti !== undefined) {
    if (!isObj(g.dormienti)) return 'dormienti';
    for (const [k, d] of Object.entries(g.dormienti)) {
      if (!ID.test(k) || own(g.nazioni, k) || !isObj(d) || d.id !== k) return `dormiente ${k}`;
      if (![d.nome, d.colore, d.cultura, d.governo].every(isStr) || !provincia(d.capitale)) return `dormiente ${k}`;
      if (!isObj(d.tratti) || !Object.values(d.tratti).every(isNum)) return `dormiente ${k}`;
      if (d.difficolta !== undefined && !isStr(d.difficolta)) return `dormiente ${k}`;
    }
  }
  return null;
}

export function writeStorage(storage, key, text) {
  try { storage.setItem(key, text); return true; } catch { return false; }
}

export function readStorage(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}
