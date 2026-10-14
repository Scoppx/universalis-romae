// Guerre: dichiarazione, lati, tregue. Punteggio, pace e proposte sotto.
import { newId, log, bordersNation, provincesOf, sumOf, RIBELLI, difficultyOf } from './state.js';
import { friendly, answerDiplomatic, onWarDeclared, cleanupDead, changeRelation } from './diplomacy.js';
import { monthlyIncome } from './economy.js';

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
  if (a === b) return false;
  if (a === RIBELLI || b === RIBELLI) return true; // i ribelli sono in guerra con tutti
  return warBetween(game, a, b) !== null;
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

// Guerra decisa da un evento o da un risveglio: chi attacca riceve prima un pretesto, quindi non perde stabilità.
export function startWar(game, a, b) {
  game.nazioni[a].pretesti ??= {};
  game.nazioni[a].pretesti[b] = Math.max(game.nazioni[a].pretesti[b] ?? -1, game.day + 1);
  return declareWar(game, a, b);
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
// Chi paga i denari di una pace: il capofila dello schieramento che perde.
export function payerOf(war, receiver) {
  return enemiesOf(war, sideOf(war, receiver))[0];
}

// Costo in punteggio di ciò che chiede `receiver`: province (in quota delle tasse dei perdenti) e denari
// (due anni di entrate del pagatore valgono quanto prendergli tutto, cioè 100).
export function peaceCost(game, war, receiver, termini) {
  const losers = enemiesOf(war, sideOf(war, receiver));
  const total = sumOf(Object.values(game.province).filter(p => losers.includes(p.owner)), 'tasse');
  const province = termini.province.reduce((s, id) => s + 100 * game.province[id].tasse / total, 0);
  const denari = termini.denari ? 100 * termini.denari / (2 * 12 * Math.max(1, monthlyIncome(game, payerOf(war, receiver)))) : 0;
  return province + denari;
}

// Forma dei termini: elenco di id di provincia, senza ripetizioni.
function malformed(termini) {
  return !termini || !Array.isArray(termini.province) ||
    (termini.annessione !== undefined && typeof termini.annessione !== 'string') ||
    (termini.denari !== undefined && !(Number.isInteger(termini.denari) && termini.denari >= 0)) ||
    (termini.assegna !== undefined && (termini.assegna === null || typeof termini.assegna !== 'object' || Array.isArray(termini.assegna) ||
      !Object.entries(termini.assegna).every(([k, v]) => typeof v === 'string' && termini.province.includes(k)))) ||
    termini.province.some(id => typeof id !== 'string') ||
    new Set(termini.province).size !== termini.province.length;
}

// Quante province di un popolo può prendere una sola pace: almeno una, al più la quota delle sue province.
export function maxCedibili(game, owner) {
  return Math.max(1, Math.floor(provincesOf(game, owner).length * (game.balance.guerra.quotaPace ?? 1)));
}

export function validTerms(game, war, receiver, termini) {
  if (malformed(termini)) return 'termini non validi';
  const side = sideOf(war, receiver);
  if (!side) return 'non partecipa';
  const mine = war[side], losers = enemiesOf(war, side);
  const ann = termini.annessione;
  // chi riceve una provincia (se il capofila lo sceglie) deve essere del suo schieramento
  if (termini.assegna && Object.values(termini.assegna).some(x => !mine.includes(x))) return 'chi riceve una provincia deve essere del tuo schieramento';
  if (ann !== undefined) {
    // un'annessione prende tutto il popolo, e solo quello
    const tutte = provincesOf(game, ann).map(p => p.id);
    if (!losers.includes(ann) || tutte.length !== termini.province.length || !tutte.every(id => termini.province.includes(id))) return 'un\'annessione prende tutte le province del popolo';
  }
  for (const id of termini.province) {
    const p = game.province[id];
    if (!p) return 'provincia inesistente';
    if (!losers.includes(p.owner)) return 'provincia non del nemico';
    if (!mine.includes(p.controller)) return ann ? `non tutte le province di ${game.nazioni[ann].nome} sono occupate` : 'provincia non occupata';
    if (game.nazioni[p.owner].capitale === id && difficultyOf(game, p.owner).capitaleSalva) return 'la capitale non si può cedere';
  }
  if (ann !== undefined) return null; // l'annessione non ha il limite di quota
  const per = {};
  for (const id of termini.province) per[game.province[id].owner] = (per[game.province[id].owner] ?? 0) + 1;
  const oltre = Object.entries(per).find(([o, k]) => k > maxCedibili(game, o));
  if (oltre) return `troppe province di ${game.nazioni[oltre[0]].nome} per una pace (al più ${maxCedibili(game, oltre[0])}): togline qualcuna, oppure annetti tutto il popolo`;
  return null;
}

// Si può annettere tutto il popolo `owner`? null se sì, altrimenti il motivo.
export function annexable(game, war, receiver, owner) {
  return validTerms(game, war, receiver, { province: provincesOf(game, owner).map(p => p.id), annessione: owner });
}

export function makePeace(game, warId, receiver, termini) {
  const war = game.guerre[warId];
  if (!war) return { ok: false, motivo: 'guerra inesistente' };
  const err = validTerms(game, war, receiver, termini);
  if (err) return { ok: false, motivo: err };
  const inf = game.balance.infamia, padroni = [];
  // ogni provincia va a chi la occupa (il ricevente o un suo alleato), che ne paga l'infamia
  for (const id of termini.province) {
    const p = game.province[id], nuovo = termini.assegna?.[id] ?? p.controller, R = game.nazioni[nuovo];
    R.infamia += inf.perProvincia + (p.cultura !== R.cultura ? inf.culturaDiversa : 0);
    // prendere una provincia occupata da un alleato: l'alleato se lo ricorda
    if (nuovo !== p.controller) changeRelation(game, nuovo, p.controller, -game.balance.guerra.presaAlleato);
    p.owner = nuovo;
    p.controller = nuovo;
    padroni.push(nuovo);
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
  const pagatore = termini.denari ? payerOf(war, receiver) : null;
  let denari = 0;
  if (pagatore) { // paga alla firma, al più quello che ha nel tesoro
    const P = game.nazioni[pagatore];
    denari = Math.min(termini.denari, Math.max(0, P.tesoro));
    P.tesoro -= denari;
    game.nazioni[receiver].tesoro += denari;
  }
  log(game, { tipo: 'pace', guerra: warId, ricevente: receiver, parti, province: [...termini.province], padroni, ...(denari ? { denari, pagatore } : {}) });
  return { ok: true };
}

// Eserciti rimasti in terra straniera (né in guerra con il padrone né amici suoi) tornano nella capitale.
export function sendStrandedHome(game) {
  for (const a of Object.values(game.eserciti)) {
    if (a.owner === RIBELLI) continue;
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
  if (termini.denari) {
    const P = game.nazioni[payerOf(war, termini.ricevente)], max = Math.max(0, Math.floor(P.tesoro));
    if (termini.denari > max) return { ok: false, motivo: `al più ${max} denari: è quanto ha ${P.nome} nel tesoro` };
  }
  const id = newId(game, 'p');
  game.proposte[id] = {
    id, tipo: 'pace', guerra: warId, da: from, a: to,
    termini: { ricevente: termini.ricevente, province: [...termini.province], ...(termini.annessione ? { annessione: termini.annessione } : {}), ...(termini.denari ? { denari: termini.denari } : {}), ...(termini.assegna ? { assegna: { ...termini.assegna } } : {}) }, giorno: game.day
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
  const r = makePeace(game, p.guerra, p.termini.ricevente, { province: p.termini.province, annessione: p.termini.annessione, denari: p.termini.denari, assegna: p.termini.assegna });
  return r.ok ? { ok: true, accettata: true } : r;
}

export function expireProposals(game) {
  for (const p of Object.values(game.proposte)) {
    if (game.day - p.giorno > game.balance.guerra.scadenzaProposta) delete game.proposte[p.id];
  }
}
