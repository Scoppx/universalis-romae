// Cultura delle province: malcontento, assimilazione, colonie, fortificazioni; rivolte e indipendenze.
import { clamp, log, sliderOf, RIBELLI, createArmy, newId } from './state.js';
import { nextRandom } from './rng.js';
import { initDiplomacy } from './diplomacy.js';
import { initGovernment } from './government.js';
import { checkSurvival, sendStrandedHome } from './war.js';

const C = game => game.balance.cultura;
const COLORI = ['#7a5c8e', '#4f7f6b', '#a0663a', '#5d6f9e', '#8e5a5a', '#6b8e3f', '#9e8a4f', '#4f8e8e'];

// Valori iniziali dei campi di provincia; non tocca quelli già presenti (salvataggi vecchi).
export function initCulture(game) {
  for (const p of Object.values(game.province)) {
    p.assimilazione ??= 0;
    p.assimilazioneDi ??= p.owner;
    p.colonia ??= null;
    p.ribelliDal ??= null;
  }
}

// Una colonia conta solo per chi l'ha fondata e possiede ancora la provincia.
export function hasColony(p) {
  return p.colonia !== null && p.colonia === p.owner;
}

// 0-10: cultura diversa dal padrone, stabilità negativa, accentramento (slider di governo negativo), colonia.
export function malcontent(game, provId) {
  const p = game.province[provId], n = game.nazioni[p.owner], c = C(game);
  let m = p.cultura !== n.cultura ? c.malcontentoCultura : 0;
  m += Math.max(0, -n.stabilita);
  m -= sliderOf(game, p.owner).governo * game.balance.slider.malcontentoAccentramento;
  if (hasColony(p)) m -= c.malcontentoColonia;
  return clamp(Math.round(m * 10) / 10, 0, 10);
}

// Punti di assimilazione al mese; a 100 la provincia prende la cultura del padrone.
export function assimilationRate(game, provId) {
  const p = game.province[provId], n = game.nazioni[p.owner];
  const base = 100 / (C(game).anniAssimilazione * 12);
  const leva = Math.max(0, 1 - sliderOf(game, p.owner).governo * game.balance.slider.assimilazioneAccentramento);
  return base * (1 + (n.tratti.assimilazione || 0)) * leva * (hasColony(p) ? 2 : 1);
}

export function colonyCost(game, provId) {
  const c = C(game);
  return c.coloniaCostoBase + c.coloniaCostoPerTassa * game.province[provId].tasse;
}

function ownProvince(game, id, provId) {
  const n = game.nazioni[id], p = game.province[provId];
  if (!n?.vivo || !game.ordine.includes(id)) return 'nazione inesistente';
  if (!p || p.owner !== id || p.controller !== id) return 'provincia non tua';
  return null;
}

export function checkColony(game, id, provId) {
  const err = ownProvince(game, id, provId);
  if (err) return err;
  const n = game.nazioni[id], p = game.province[provId];
  if (p.cultura === n.cultura) return 'è già della tua cultura';
  if (hasColony(p)) return 'colonia già fondata';
  if (n.tesoro < colonyCost(game, provId)) return 'denaro insufficiente';
  if (n.uomini < C(game).coloniaUomini) return 'uomini insufficienti';
  return null;
}

export function foundColony(game, id, provId) {
  const err = checkColony(game, id, provId);
  if (err) return { ok: false, motivo: err };
  const n = game.nazioni[id];
  n.tesoro -= colonyCost(game, provId);
  n.uomini -= C(game).coloniaUomini;
  game.province[provId].colonia = id;
  log(game, { tipo: 'colonia', prov: provId, nazione: id });
  return { ok: true };
}

export function fortCost(game, provId) {
  const c = C(game), f = game.province[provId].fort;
  return f >= c.fortMax ? null : c.fortificazioneCosti[f];
}

export function checkFortify(game, id, provId) {
  const err = ownProvince(game, id, provId);
  if (err) return err;
  const costo = fortCost(game, provId);
  if (costo === null) return 'fortificazione al massimo';
  if (game.nazioni[id].tesoro < costo) return 'denaro insufficiente';
  return null;
}

export function fortify(game, id, provId) {
  const err = checkFortify(game, id, provId);
  if (err) return { ok: false, motivo: err };
  game.nazioni[id].tesoro -= fortCost(game, provId);
  game.province[provId].fort += 1;
  return { ok: true };
}

// Il record dei ribelli nasce alla prima rivolta: ha i campi che la simulazione legge di ogni popolo.
export function ensureRebels(game) {
  game.nazioni[RIBELLI] ??= {
    id: RIBELLI, nome: 'Ribelli', colore: '#2b2b2b', cultura: '', governo: '', capitale: null,
    tesoro: 0, uomini: 0, stabilita: 0, infamia: 0, tratti: {}, vivo: true, tregue: {}, obiettivo: null,
    relazioni: {}, alleati: [], protettore: null, tributo: null, pretesti: {}, ambascerie: {}, ultimatumInviati: {}
  };
}

function maybeRevolt(game, provId, ribelliIn) {
  const p = game.province[provId], c = C(game);
  if (p.controller !== p.owner || ribelliIn.has(provId)) return;
  const m = malcontent(game, provId);
  if (m <= c.sogliaRivolta) return;
  if (nextRandom(game) >= (m - c.sogliaRivolta) * c.rivoltaPerPunto) return;
  ensureRebels(game);
  createArmy(game, RIBELLI, provId, p.uomini * c.ribelliPerUomo, 0);
  log(game, { tipo: 'rivolta', prov: provId, nazione: p.owner });
}

// Popolo nuovo nato da una provincia indipendente: cultura della provincia, capitale lì, tribù.
export function spawnNation(game, provId) {
  const p = game.province[provId], b = game.balance;
  const id = newId(game, `liberi_${provId}_`);
  game.nazioni[id] = {
    id, nome: `Liberi di ${p.nome}`, colore: COLORI[game.ordine.length % COLORI.length],
    cultura: p.cultura, governo: 'tribù', capitale: provId,
    tesoro: p.tasse * b.economia.tasseMese * b.inizio.tesoroMesi, uomini: 0, stabilita: 0, infamia: 0,
    tratti: {}, vivo: true, tregue: {}, obiettivo: null
  };
  game.ordine.push(id);
  initDiplomacy(game);
  initGovernment(game);
  return id;
}

// Un anno in mano ai ribelli: la provincia va al popolo vivo della sua cultura che vi confina, o a un popolo nuovo.
export function independence(game, provId) {
  const p = game.province[provId], vecchio = p.owner;
  const fratelli = game.ordine.filter(id => id !== vecchio && game.nazioni[id].vivo &&
    game.nazioni[id].cultura === p.cultura && p.vicini.some(v => game.province[v].owner === id));
  const nuovo = fratelli[0] ?? spawnNation(game, provId);
  if (!fratelli.length) {
    const fine = game.day + game.balance.guerra.tregua; // l'indipendenza è riconosciuta: niente guerra subito
    game.nazioni[nuovo].tregue[vecchio] = fine;
    game.nazioni[vecchio].tregue[nuovo] = fine;
  }
  p.owner = nuovo;
  p.controller = nuovo;
  p.ribelliDal = null;
  p.assimilazione = 0;
  p.assimilazioneDi = nuovo;
  for (const a of Object.values(game.eserciti)) {
    if (a.prov === provId && a.owner === RIBELLI) { a.owner = nuovo; a.percorso = []; }
  }
  log(game, { tipo: 'indipendenza', prov: provId, da: vecchio, a: nuovo });
  checkSurvival(game);
  sendStrandedHome(game);
}

// Ogni mese, in ordine di id: assimilazione (solo se il padrone controlla la provincia), indipendenze, rivolte.
export function monthlyCulture(game) {
  const ribelliIn = new Set(Object.values(game.eserciti).filter(a => a.owner === RIBELLI).map(a => a.prov));
  for (const id of Object.keys(game.province).sort()) {
    const p = game.province[id], n = game.nazioni[p.owner];
    if (!n.vivo) continue;
    if (p.assimilazioneDi !== p.owner) { p.assimilazione = 0; p.assimilazioneDi = p.owner; }
    if (p.cultura !== n.cultura && p.controller === p.owner) {
      p.assimilazione = Math.min(100, p.assimilazione + assimilationRate(game, id));
      if (p.assimilazione >= 100 - 1e-9) {
        p.cultura = n.cultura;
        p.assimilazione = 0;
        log(game, { tipo: 'assimilata', prov: id, nazione: p.owner });
      }
    }
    if (p.controller === RIBELLI && p.ribelliDal !== null && game.day - p.ribelliDal >= C(game).anniIndipendenza * 365) {
      independence(game, id);
      continue;
    }
    maybeRevolt(game, id, ribelliIn);
  }
}
