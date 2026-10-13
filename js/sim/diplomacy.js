// Diplomazia: relazioni, ambascerie, alleanze, foedus, tributi, ultimatum, pretesti, coalizioni, chiamate alle armi.
import { clamp, newId, log, bordersNation, provincesOf, power, maxManpower } from './state.js';
import { atWar, sideOf, enemiesOf, inTruce, checkSurvival } from './war.js';
import { monthlyIncome, monthlyManpower } from './economy.js';

const D = game => game.balance.diplomazia;

export function baseRelation(game, a, b) {
  return game.nazioni[a].cultura === game.nazioni[b].cultura ? D(game).relazioneStessaCultura : 0;
}

// Valori iniziali dei campi diplomatici; non tocca quelli già presenti (salvataggi vecchi, popoli nuovi).
export function initDiplomacy(game) {
  for (const a of game.ordine) {
    const n = game.nazioni[a];
    n.relazioni ??= {};
    for (const b of game.ordine) if (a !== b && n.relazioni[b] === undefined) n.relazioni[b] = baseRelation(game, a, b);
    n.alleati ??= [];
    n.protettore ??= null;
    n.tributo ??= null;
    n.pretesti ??= {};
    n.ambascerie ??= {};
  }
}

export function relation(game, a, b) {
  return game.nazioni[a].relazioni[b] ?? baseRelation(game, a, b);
}

export function changeRelation(game, a, b, delta) {
  const v = clamp(relation(game, a, b) + delta, -200, 200);
  game.nazioni[a].relazioni[b] = v;
  game.nazioni[b].relazioni[a] = v;
}

export function checkEmbassy(game, from, to) {
  const A = game.nazioni[from];
  if (!A?.vivo || !game.nazioni[to]?.vivo || from === to) return 'popolo non valido';
  if (game.day - (A.ambascerie[to] ?? -Infinity) < D(game).ambasceriaAttesa) return 'ambasceria già inviata quest\'anno';
  if (A.tesoro < D(game).ambasceriaCosto) return 'denaro insufficiente';
  return null;
}

export function embassy(game, from, to) {
  const err = checkEmbassy(game, from, to);
  if (err) return { ok: false, motivo: err };
  const A = game.nazioni[from];
  A.tesoro -= D(game).ambasceriaCosto;
  A.ambascerie[to] = game.day;
  changeRelation(game, from, to, D(game).ambasceriaEffetto);
  return { ok: true };
}

export function monthlyDiplomacy(game) {
  const d = D(game);
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    if (!n.vivo) continue;
    if (n.tributo) {
      const R = game.nazioni[n.tributo.a];
      if (!R?.vivo || game.day >= n.tributo.fine) n.tributo = null;
      else {
        const q = Math.max(0, monthlyIncome(game, id)) * d.tributoQuota;
        n.tesoro -= q;
        R.tesoro += q;
      }
    }
    if (n.protettore) {
      const P = game.nazioni[n.protettore];
      if (!P?.vivo) n.protettore = null;
      else {
        const t = Math.min(n.uomini, Math.round(monthlyManpower(game, id) * d.federatoUomini));
        n.uomini -= t;
        P.uomini = Math.min(maxManpower(game, n.protettore), P.uomini + t);
      }
    }
    n.alleati = n.alleati.filter(x => game.nazioni[x].vivo);
    for (const o of game.ordine) {
      if (o <= id || !game.nazioni[o].vivo || atWar(game, id, o)) continue; // ogni coppia una volta
      const v = relation(game, id, o), b = baseRelation(game, id, o);
      if (v !== b) changeRelation(game, id, o, Math.sign(b - v) * Math.min(d.derivaMese, Math.abs(b - v)));
    }
  }
}

export function allied(game, a, b) {
  return game.nazioni[a].alleati.includes(b);
}

export function federatiOf(game, id) {
  return game.ordine.filter(x => game.nazioni[x].vivo && game.nazioni[x].protettore === id);
}

// Amici: alleati, o protettore e federato. Si attraversano le terre e non si combattono.
export function friendly(game, a, b) {
  const A = game.nazioni[a], B = game.nazioni[b];
  return allied(game, a, b) || A.protettore === b || B.protettore === a;
}

export function checkProposal(game, from, genere, to, extra = {}) {
  const A = game.nazioni[from], B = game.nazioni[to], d = D(game);
  if (!A?.vivo || !B?.vivo || from === to) return 'popolo non valido';
  if (Object.values(game.proposte).some(p => p.tipo === genere && p.da === from && p.a === to)) return 'proposta già in attesa';
  if (atWar(game, from, to)) return 'siete in guerra';
  switch (genere) {
    case 'alleanza':
      if (allied(game, from, to)) return 'siete già alleati';
      if (A.protettore || B.protettore) return 'un federato non stringe alleanze';
      if (A.alleati.length >= d.maxAlleati || B.alleati.length >= d.maxAlleati) return 'troppe alleanze';
      return null;
    case 'foedus':
      if (A.protettore || B.protettore) return 'già in un foedus';
      if (!bordersNation(game, from, to)) return 'nessun confine';
      if (power(game, from) < d.foedusRapporto * power(game, to)) return 'non abbastanza più forte';
      if (relation(game, from, to) < d.foedusMinRelazione) return 'relazioni troppo basse';
      return null;
    case 'tributo':
      if (!bordersNation(game, from, to)) return 'nessun confine';
      if (B.tributo) return 'paga già un tributo';
      return null;
    case 'ultimatum': {
      const p = game.province[extra.provincia];
      if (!p || p.owner !== to || p.controller !== to) return 'provincia non valida';
      if (!p.vicini.some(v => game.province[v].owner === from)) return 'provincia non confinante';
      if (provincesOf(game, to).length < 2) return 'è la sua ultima provincia';
      return null;
    }
    default:
      return 'proposta sconosciuta';
  }
}

export function propose(game, from, genere, to, extra = {}) {
  const err = checkProposal(game, from, genere, to, extra);
  if (err) return { ok: false, motivo: err };
  const id = newId(game, 'p');
  game.proposte[id] = { id, tipo: genere, da: from, a: to, giorno: game.day, ...(genere === 'ultimatum' ? { provincia: extra.provincia } : {}) };
  log(game, { tipo: 'proposta', proposta: id, da: from, a: to, genere });
  return { ok: true, proposta: id };
}

export function breakAlliance(game, a, b) {
  if (!game.nazioni[a]?.alleati.includes(b)) return { ok: false, motivo: 'non siete alleati' };
  game.nazioni[a].alleati = game.nazioni[a].alleati.filter(x => x !== b);
  game.nazioni[b].alleati = game.nazioni[b].alleati.filter(x => x !== a);
  changeRelation(game, a, b, -D(game).rotturaAlleanza);
  return { ok: true };
}

// Risposta a una proposta che non è di pace (la proposta è già stata tolta da game.proposte).
export function answerDiplomatic(game, p, accetta) {
  const d = D(game), A = game.nazioni[p.da], B = game.nazioni[p.a];
  if (!accetta) {
    if ((p.tipo === 'tributo' || p.tipo === 'ultimatum') && A.vivo) A.pretesti[p.a] = game.day + d.pretestoAnni * 365;
    if (p.tipo === 'chiamata') {
      if (allied(game, p.da, p.a)) breakAlliance(game, p.da, p.a);
      changeRelation(game, p.da, p.a, d.rifiutoChiamata);
    }
    log(game, { tipo: 'rifiutata', proposta: p.id, da: p.da, a: p.a, genere: p.tipo });
    return { ok: true, accettata: false };
  }
  if (p.tipo === 'chiamata') return joinCall(game, p);
  const err = checkProposal(game, p.da, p.tipo, p.a, p);
  if (err) return { ok: false, motivo: err };
  if (p.tipo === 'alleanza') {
    A.alleati.push(p.a);
    B.alleati.push(p.da);
    changeRelation(game, p.da, p.a, d.alleanzaEffetto);
  } else if (p.tipo === 'foedus') {
    for (const x of [...B.alleati]) breakAlliance(game, p.a, x);
    B.protettore = p.da;
  } else if (p.tipo === 'tributo') {
    B.tributo = { a: p.da, fine: game.day + d.tributoAnni * 365 };
  } else if (p.tipo === 'ultimatum') {
    const prov = game.province[p.provincia], inf = game.balance.infamia;
    A.infamia += inf.perProvincia + (prov.cultura !== A.cultura ? inf.culturaDiversa : 0);
    prov.owner = p.da;
    prov.controller = p.da;
    checkSurvival(game);
  }
  log(game, { tipo: 'accordo', genere: p.tipo, da: p.da, a: p.a, provincia: p.provincia ?? null });
  return { ok: true, accettata: true };
}

// Segnaposto: l'ingresso in guerra dell'alleato arriva con le guerre a più popoli.
function joinCall() {
  return { ok: false, motivo: 'chiamata non valida' };
}
