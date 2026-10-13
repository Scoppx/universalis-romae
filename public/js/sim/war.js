// Guerre: dichiarazione, lati, tregue. Punteggio, pace e proposte sotto.
import { newId, log, bordersNation, provincesOf, sumOf } from './state.js';
import { friendly, answerDiplomatic, onWarDeclared, cleanupDead } from './diplomacy.js';

export function sideOf(war, id) {
  if (war.attaccanti.includes(id)) return 'attaccanti';
  if (war.difensori.includes(id)) return 'difensori';
  return null;
}

export function enemiesOf(war, side) {
  return side === 'attaccanti' ? war.difensori : war.attaccanti;
}

export function warBetween(game, a, b) {
  return Object.values(game.guerre).find(w => {
    const sa = sideOf(w, a), sb = sideOf(w, b);
    return sa && sb && sa !== sb;
  }) || null;
}

export function atWar(game, a, b) {
  return a !== b && warBetween(game, a, b) !== null;
}

export function hasPretext(game, attacker, defender) {
  return game.nazioni[defender].infamia > game.balance.infamia.soglia ||
    (game.nazioni[attacker].pretesti?.[defender] ?? -1) > game.day;
}

export function inTruce(game, a, b) {
  return (game.nazioni[a].tregue[b] ?? -1) > game.day;
}

export function checkWar(game, attacker, defender) {
  const A = game.nazioni[attacker], D = game.nazioni[defender];
  if (!A?.vivo || !D?.vivo || attacker === defender) return 'nazione non valida';
  if (A.protettore) return 'un federato non dichiara guerre';
  if (friendly(game, attacker, defender)) return 'siete alleati';
  if (atWar(game, attacker, defender)) return 'già in guerra';
  if (inTruce(game, attacker, defender)) return 'tregua in corso';
  if (!bordersNation(game, attacker, defender)) return 'nessun confine';
  return null;
}

export function declareWar(game, attacker, defender) {
  const err = checkWar(game, attacker, defender);
  if (err) return { ok: false, motivo: err };
  const A = game.nazioni[attacker];
  if (!hasPretext(game, attacker, defender)) A.stabilita = Math.max(-3, A.stabilita - game.balance.guerra.senzaPretesto);
  const id = newId(game, 'g');
  game.guerre[id] = { id, attaccanti: [attacker], difensori: [defender], inizio: game.day, battaglie: 0 };
  onWarDeclared(game, game.guerre[id]);
  log(game, { tipo: 'guerra', guerra: id, attaccante: attacker, difensore: defender });
  return { ok: true, guerra: id };
}

// Quota (0-100) del valore delle province di un lato occupata dall'altro lato.
function occupation(game, war, side) {
  const owners = war[side], enemies = enemiesOf(war, side);
  const owned = Object.values(game.province).filter(p => owners.includes(p.owner));
  const total = sumOf(owned, 'tasse');
  if (total === 0) return 100;
  return 100 * sumOf(owned.filter(p => enemies.includes(p.controller)), 'tasse') / total;
}

// Punteggio dal punto di vista degli attaccanti.
export function warscore(game, war) {
  const s = occupation(game, war, 'difensori') - occupation(game, war, 'attaccanti') + war.battaglie;
  return Math.max(-100, Math.min(100, s));
}

export function scoreFor(game, war, nationId) {
  const s = warscore(game, war);
  return sideOf(war, nationId) === 'attaccanti' ? s : -s;
}

// Costo in punteggio delle province chieste da `receiver`.
export function peaceCost(game, war, receiver, termini) {
  const losers = enemiesOf(war, sideOf(war, receiver));
  const total = sumOf(Object.values(game.province).filter(p => losers.includes(p.owner)), 'tasse');
  return termini.province.reduce((s, id) => s + 100 * game.province[id].tasse / total, 0);
}

// Forma dei termini: elenco di id di provincia, senza ripetizioni.
function malformed(termini) {
  return !termini || !Array.isArray(termini.province) ||
    termini.province.some(id => typeof id !== 'string') ||
    new Set(termini.province).size !== termini.province.length;
}

export function validTerms(game, war, receiver, termini) {
  if (malformed(termini)) return 'termini non validi';
  const side = sideOf(war, receiver);
  if (!side) return 'non partecipa';
  const mine = war[side], losers = enemiesOf(war, side);
  for (const id of termini.province) {
    const p = game.province[id];
    if (!p) return 'provincia inesistente';
    if (!losers.includes(p.owner)) return 'provincia non del nemico';
    if (!mine.includes(p.controller)) return 'provincia non occupata';
  }
  return null;
}

export function makePeace(game, warId, receiver, termini) {
  const war = game.guerre[warId];
  if (!war) return { ok: false, motivo: 'guerra inesistente' };
  const err = validTerms(game, war, receiver, termini);
  if (err) return { ok: false, motivo: err };
  const R = game.nazioni[receiver], inf = game.balance.infamia;
  for (const id of termini.province) {
    const p = game.province[id];
    R.infamia += inf.perProvincia + (p.cultura !== R.cultura ? inf.culturaDiversa : 0);
    p.owner = receiver;
    p.controller = receiver;
  }
  const parti = [...war.attaccanti, ...war.difensori];
  for (const p of Object.values(game.province)) {
    if (p.controller !== p.owner && parti.includes(p.owner) && parti.includes(p.controller)) p.controller = p.owner;
  }
  const fine = game.day + game.balance.guerra.tregua;
  for (const a of war.attaccanti) for (const d of war.difensori) {
    game.nazioni[a].tregue[d] = fine;
    game.nazioni[d].tregue[a] = fine;
  }
  delete game.guerre[warId];
  for (const p of Object.values(game.proposte)) if (p.guerra === warId) delete game.proposte[p.id];
  checkSurvival(game);
  sendStrandedHome(game);
  log(game, { tipo: 'pace', guerra: warId, ricevente: receiver, parti, province: [...termini.province] });
  return { ok: true };
}

// Eserciti rimasti in terra straniera (né in guerra con il padrone né amici suoi) tornano nella capitale.
export function sendStrandedHome(game) {
  for (const a of Object.values(game.eserciti)) {
    const p = game.province[a.prov];
    if (p.owner !== a.owner && p.controller !== a.owner && !atWar(game, a.owner, p.owner) && !friendly(game, a.owner, p.owner)) {
      a.prov = game.nazioni[a.owner].capitale;
      a.percorso = [];
    }
  }
}

// Capitale persa: passa alla provincia più ricca. Nessuna provincia: nazione eliminata.
export function checkSurvival(game) {
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    if (!n.vivo) continue;
    const owned = provincesOf(game, id);
    if (owned.length === 0) { eliminate(game, id); continue; }
    if (game.province[n.capitale].owner !== id) {
      n.capitale = owned.reduce((best, p) => (p.tasse > best.tasse || (p.tasse === best.tasse && p.id < best.id) ? p : best)).id;
    }
  }
}

function eliminate(game, id) {
  game.nazioni[id].vivo = false;
  cleanupDead(game, id);
  for (const a of Object.values(game.eserciti)) if (a.owner === id) delete game.eserciti[a.id];
  for (const w of Object.values(game.guerre)) {
    w.attaccanti = w.attaccanti.filter(x => x !== id);
    w.difensori = w.difensori.filter(x => x !== id);
    if (!w.attaccanti.length || !w.difensori.length) delete game.guerre[w.id];
  }
  for (const p of Object.values(game.province)) if (p.controller === id) p.controller = p.owner;
  for (const pr of Object.values(game.proposte)) {
    if (pr.da === id || pr.a === id || (pr.guerra && !game.guerre[pr.guerra])) delete game.proposte[pr.id];
  }
  log(game, { tipo: 'eliminata', nazione: id });
}

export function proposePeace(game, from, warId, termini) {
  const war = game.guerre[warId];
  if (!war) return { ok: false, motivo: 'guerra inesistente' };
  if (malformed(termini)) return { ok: false, motivo: 'termini non validi' };
  const side = sideOf(war, from);
  if (!side) return { ok: false, motivo: 'non partecipa' };
  if (war[side][0] !== from) return { ok: false, motivo: 'solo il capofila firma la pace' };
  const to = enemiesOf(war, side)[0];
  if (termini.ricevente !== from && termini.ricevente !== to) return { ok: false, motivo: 'ricevente non valido' };
  const err = validTerms(game, war, termini.ricevente, termini);
  if (err) return { ok: false, motivo: err };
  const id = newId(game, 'p');
  game.proposte[id] = {
    id, tipo: 'pace', guerra: warId, da: from, a: to,
    termini: { ricevente: termini.ricevente, province: [...termini.province] }, giorno: game.day
  };
  log(game, { tipo: 'proposta', proposta: id, da: from, a: to });
  return { ok: true, proposta: id };
}

export function answerProposal(game, nationId, propId, accetta) {
  const p = game.proposte[propId];
  if (!p || p.a !== nationId) return { ok: false, motivo: 'proposta inesistente' };
  delete game.proposte[propId];
  if (p.tipo !== 'pace') return answerDiplomatic(game, p, accetta);
  if (!accetta) {
    log(game, { tipo: 'rifiutata', proposta: propId, da: p.da, a: p.a });
    return { ok: true, accettata: false };
  }
  const r = makePeace(game, p.guerra, p.termini.ricevente, { province: p.termini.province });
  return r.ok ? { ok: true, accettata: true } : r;
}

export function expireProposals(game) {
  for (const p of Object.values(game.proposte)) {
    if (game.day - p.giorno > game.balance.guerra.scadenzaProposta) delete game.proposte[p.id];
  }
}
