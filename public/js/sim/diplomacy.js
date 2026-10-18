// Diplomazia: relazioni, ambascerie, alleanze, foedus, tributi, ultimatum, pretesti, coalizioni, chiamate alle armi.
import { clamp, newId, log, bordersNation, provincesOf, power, maxManpower, governmentOf, difficultyOf, neighborsOf } from './state.js';
import { atWar, sideOf, enemiesOf, inTruce, checkSurvival, sendStrandedHome, checkWar, hasPretext, startWar } from './war.js';
import { monthlyIncome, monthlyManpower } from './economy.js';

const D = game => game.balance.diplomazia;

export function baseRelation(game, a, b) {
  return game.nazioni[a].cultura === game.nazioni[b].cultura ? D(game).relazioneStessaCultura : 0;
}

// Valori iniziali dei campi diplomatici; non tocca quelli già presenti (salvataggi vecchi, popoli nuovi).
export function initDiplomacy(game) {
  game.coalizioni ??= {}; // coalizioni annunciate: { [bersaglio]: { membri, dal } }
  for (const a of game.ordine) {
    const n = game.nazioni[a];
    n.relazioni ??= {};
    for (const b of game.ordine) if (a !== b && n.relazioni[b] === undefined) n.relazioni[b] = baseRelation(game, a, b);
    n.alleati ??= [];
    n.protettore ??= null;
    n.tributo ??= null;
    n.pretesti ??= {};
    n.ambascerie ??= {};
    n.ultimatumInviati ??= {};
    n.ultimatumAccettati ??= {}; // a chi ha già ceduto una provincia per ultimatum, e quando
    n.coalizioneDal ??= null;    // ultima coalizione affrontata (o sciolta)
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

// Forza con cui un popolo si difende: lui, i suoi alleati, i suoi federati e il suo protettore.
export function forzaDifesa(game, id) {
  const n = game.nazioni[id];
  const amici = new Set([id, ...n.alleati, ...federatiOf(game, id), ...(n.protettore ? [n.protettore] : [])]);
  return [...amici].filter(x => game.nazioni[x]?.vivo).reduce((s, x) => s + power(game, x), 0);
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
      if (power(game, from) < (governmentOf(game, from).foedusRapporto ?? d.foedusRapporto) * power(game, to)) return 'non abbastanza più forte';
      if (relation(game, from, to) < d.foedusMinRelazione) return 'relazioni troppo basse';
      return null;
    case 'tributo':
      if (!bordersNation(game, from, to)) return 'nessun confine';
      if (B.tributo) return 'paga già un tributo';
      return null;
    case 'ultimatum': {
      if (!extra.accettazione && game.day - (A.ultimatumInviati?.[to] ?? -Infinity) < 365) return 'ultimatum già inviato quest\'anno';
      const resta = (A.ultimatumAccettati?.[to] ?? -Infinity) + game.balance.ultimatum.anniAttesa * 365 - game.day;
      if (!extra.accettazione && resta > 0) return `hai già avuto una provincia da lui: riprova tra ${Math.ceil(resta / 365)} anni`;
      const p = game.province[extra.provincia];
      if (!p || p.owner !== to || p.controller !== to) return 'provincia non valida';
      if (!p.vicini.some(v => game.province[v].owner === from)) return 'provincia non confinante';
      if (provincesOf(game, to).length < 2) return 'è la sua ultima provincia';
      if (B.capitale === p.id && difficultyOf(game, to).capitaleSalva) return 'la capitale non si può chiedere';
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
  if (genere === 'ultimatum') game.nazioni[from].ultimatumInviati[to] = game.day; // al massimo uno l'anno
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
  const err = checkProposal(game, p.da, p.tipo, p.a, { ...p, accettazione: true }); // il limite d'invio non vale qui
  if (err) return { ok: false, motivo: err };
  if (p.tipo === 'alleanza') {
    A.alleati.push(p.a);
    B.alleati.push(p.da);
    changeRelation(game, p.da, p.a, d.alleanzaEffetto);
  } else if (p.tipo === 'foedus') {
    for (const x of [...B.alleati]) breakAlliance(game, p.a, x);
    B.protettore = p.da;
    B.foedusDal = game.day;
  } else if (p.tipo === 'tributo') {
    B.tributo = { a: p.da, fine: game.day + d.tributoAnni * 365 };
  } else if (p.tipo === 'ultimatum') {
    const prov = game.province[p.provincia], inf = game.balance.infamia, u = game.balance.ultimatum;
    // prendere senza combattere è più odioso: più infamia, rancore del bersaglio e dei suoi vicini, e anni di attesa
    A.infamia += (inf.perProvincia + (prov.cultura !== A.cultura ? inf.culturaDiversa : 0)) * u.infamia;
    changeRelation(game, p.da, p.a, u.relazioneBersaglio);
    for (const v of neighborsOf(game, p.a)) if (v !== p.da && game.nazioni[v]?.vivo && game.ordine.includes(v)) changeRelation(game, v, p.da, u.relazioneVicini);
    A.ultimatumAccettati[p.a] = game.day;
    prov.owner = p.da;
    prov.controller = p.da;
    checkSurvival(game);
    sendStrandedHome(game);
  }
  log(game, { tipo: 'accordo', genere: p.tipo, da: p.da, a: p.a, provincia: p.provincia ?? null });
  return { ok: true, accettata: true };
}

// Si può entrare in guerra contro tutto il lato nemico solo se nessuno di loro è amico o in tregua.
function puoEntrare(game, war, id, contro) {
  return Boolean(id) && game.nazioni[id]?.vivo && !sideOf(war, id) &&
    contro.every(x => !friendly(game, id, x) && !inTruce(game, id, x));
}

function joinCall(game, p) {
  const war = game.guerre[p.guerra], d = D(game);
  const side = war && sideOf(war, p.da);
  if (!side) return { ok: false, motivo: 'la guerra non c\'è più' };
  if (!allied(game, p.da, p.a) || game.nazioni[p.a].protettore) return { ok: false, motivo: 'non siete più alleati' };
  if (!puoEntrare(game, war, p.a, enemiesOf(war, side))) return { ok: false, motivo: 'non può combattere contro un amico' };
  war[side].push(p.a);
  for (const e of enemiesOf(war, side)) changeRelation(game, p.a, e, d.guerraRelazione);
  log(game, { tipo: 'chiamata', guerra: war.id, nazione: p.a, alleato: p.da });
  return { ok: true, accettata: true };
}

export function coalition(game, x) {
  if (game.nazioni[x].infamia <= game.balance.infamia.soglia) return [];
  return game.ordine.filter(o => o !== x && game.nazioni[o].vivo && bordersNation(game, o, x) &&
    relation(game, o, x) < 0 && !friendly(game, o, x));
}

// Chi entra da solo quando scoppia una guerra, chi viene chiamato.
// Anteprima di una dichiarazione di guerra: le stesse regole di onWarDeclared, senza toccare lo stato.
export function warPreview(game, att, dif) {
  const errore = checkWar(game, att, dif);
  const war = { attaccanti: [att], difensori: [dif] };
  const B = game.nazioni[dif];
  const nemici = [{ id: dif, ruolo: 'bersaglio' }];
  const difesa = [...B.alleati.map(id => [id, 'alleato']), ...federatiOf(game, dif).map(id => [id, 'federato']),
    [B.protettore, 'protettore'], ...coalition(game, att).map(id => [id, 'coalizione'])];
  for (const [id, ruolo] of difesa) {
    if (puoEntrare(game, war, id, war.attaccanti)) { war.difensori.push(id); nemici.push({ id, ruolo }); }
  }
  const federati = [];
  for (const id of federatiOf(game, att)) if (puoEntrare(game, war, id, war.difensori)) { war.attaccanti.push(id); federati.push(id); }
  const chiamati = [], esclusi = [];
  for (const id of game.nazioni[att].alleati) {
    if (!game.nazioni[id]?.vivo) continue;
    if (puoEntrare(game, war, id, war.difensori)) chiamati.push({ id, probabile: relation(game, id, att) >= D(game).chiamataMinRelazione });
    else esclusi.push({ id, motivo: sideOf(war, id) ? 'combatterebbe dall\'altra parte' : war.difensori.some(x => friendly(game, id, x)) ? 'è amico di chi attacchi' : 'è in tregua con chi attacchi' });
  }
  const n = game.nazioni[att], pretesto = hasPretext(game, att, dif);
  return {
    errore, nemici, federati, chiamati, esclusi, pretesto,
    stabilita: { prima: n.stabilita, dopo: pretesto ? n.stabilita : Math.max(-3, n.stabilita - game.balance.guerra.senzaPretesto) }
  };
}

export function onWarDeclared(game, war) {
  const [att] = war.attaccanti, [dif] = war.difensori;
  const d = D(game);
  const difesa = [...game.nazioni[dif].alleati, ...federatiOf(game, dif), game.nazioni[dif].protettore, ...coalition(game, att)];
  for (const id of difesa) if (puoEntrare(game, war, id, war.attaccanti)) war.difensori.push(id);
  for (const id of federatiOf(game, att)) if (puoEntrare(game, war, id, war.difensori)) war.attaccanti.push(id);
  for (const id of game.nazioni[att].alleati) {
    if (!puoEntrare(game, war, id, war.difensori)) continue;
    const pid = newId(game, 'p');
    game.proposte[pid] = { id: pid, tipo: 'chiamata', guerra: war.id, da: att, a: id, giorno: game.day };
  }
  for (const a of war.attaccanti) for (const b of war.difensori) changeRelation(game, a, b, d.guerraRelazione);
}

export function cleanupDead(game, id) {
  for (const o of game.ordine) {
    const n = game.nazioni[o];
    n.alleati = n.alleati.filter(x => x !== id);
    if (n.protettore === id) n.protettore = null;
    if (n.tributo?.a === id) n.tributo = null;
  }
  game.nazioni[id].alleati = [];
  game.nazioni[id].protettore = null;
  game.nazioni[id].tributo = null;
}

export function checkLeaveFoedus(game, id) {
  const n = game.nazioni[id];
  if (!n?.vivo || !n.protettore) return 'non sei in un foedus';
  if (Object.values(game.guerre).some(w => sideOf(w, id))) return 'non durante una guerra';
  return null;
}

// Uscire dal foedus: si torna liberi, ma si perde stabilità e il protettore ottiene un pretesto di guerra.
export function leaveFoedus(game, id) {
  const err = checkLeaveFoedus(game, id);
  if (err) return { ok: false, motivo: err };
  const n = game.nazioni[id], d = D(game), P = n.protettore;
  n.protettore = null;
  n.stabilita = Math.max(-3, n.stabilita - d.uscitaFoedusStabilita);
  changeRelation(game, id, P, d.uscitaFoedusRelazione);
  game.nazioni[P].pretesti[id] = game.day + d.pretestoAnni * 365;
  log(game, { tipo: 'uscita', nazione: id, protettore: P });
  return { ok: true };
}

// --- coalizioni annunciate

// Soglia d'infamia oltre la quale si forma una coalizione contro x (più bassa per il giocatore a sfida storico).
export function sogliaCoalizione(game, x) {
  const base = game.balance.infamia.soglia;
  return x === game.giocatore ? (game.balance.sfida?.[game.sfida]?.sogliaCoalizione ?? base) : base;
}

// Chi può entrare in una coalizione contro x: popoli ostili di tutta Italia (anche non confinanti), liberi,
// non in guerra o in tregua con lui, e senza troppa infamia a loro volta.
export function coalitionCandidates(game, x) {
  const soglia = game.balance.infamia.soglia;
  return game.ordine.filter(o => o !== x && game.nazioni[o].vivo && !game.nazioni[o].protettore &&
    relation(game, o, x) < 0 && !friendly(game, o, x) && !atWar(game, o, x) && !inTruce(game, o, x) && game.nazioni[o].infamia < soglia);
}

const forzaDi = (game, ids) => ids.reduce((s, o) => s + power(game, o), 0);

// Ogni mese: contro chi ha troppa infamia si forma una coalizione (annunciata); dopo il preavviso, se l'infamia
// è ancora alta e la coalizione abbastanza forte, dichiara guerra tutta insieme; altrimenti si scioglie.
export function monthlyCoalitions(game) {
  game.coalizioni ??= {};
  const c = game.balance.coalizione;
  for (const x of game.ordine) {
    const X = game.nazioni[x];
    if (!X.vivo) { delete game.coalizioni[x]; continue; }
    const annunciata = game.coalizioni[x];
    if (annunciata) {
      if (game.day - annunciata.dal < c.preavviso) continue;
      delete game.coalizioni[x];
      const membri = coalitionCandidates(game, x).filter(o => annunciata.membri.includes(o));
      const forte = membri.length && forzaDi(game, membri) >= c.rapporto * forzaDifesa(game, x);
      // guida il membro più forte tra quelli che confinano con x (chi non confina si aggiunge)
      const capo = forte && X.infamia > sogliaCoalizione(game, x)
        ? [...membri].filter(o => bordersNation(game, o, x)).sort((a, b) => power(game, b) - power(game, a) || (a < b ? -1 : 1))[0] ?? null : null;
      const r = capo ? startWar(game, capo, x) : { ok: false };
      if (r.ok) {
        const w = game.guerre[r.guerra];
        for (const o of membri) {
          if (o === capo || !puoEntrare(game, w, o, w.difensori)) continue;
          w.attaccanti.push(o);
          for (const dd of w.difensori) changeRelation(game, o, dd, D(game).guerraRelazione);
        }
        X.coalizioneDal = game.day;
        log(game, { tipo: 'coalizione_guerra', contro: x, membri: w.attaccanti.filter(o => membri.includes(o)) });
      } else {
        X.coalizioneDal = game.day - (c.anniAttesa - 1) * 365; // sciolta: se ne può formare un'altra tra un anno
        log(game, { tipo: 'coalizione_sciolta', contro: x });
      }
      continue;
    }
    if (X.infamia <= sogliaCoalizione(game, x)) continue;
    if (game.day - (X.coalizioneDal ?? -Infinity) < c.anniAttesa * 365) continue;
    const membri = coalitionCandidates(game, x);
    if (membri.length && forzaDi(game, membri) >= c.rapporto * forzaDifesa(game, x)) {
      game.coalizioni[x] = { membri, dal: game.day };
      log(game, { tipo: 'coalizione_formata', contro: x, membri });
    }
  }
}

// --- foedus: integrare o liberare un federato

export function integrationCost(game, f) {
  return game.balance.foedus.costoPerTassa * provincesOf(game, f).reduce((s, p) => s + p.tasse, 0);
}

export function checkIntegrate(game, P, f) {
  const F = game.nazioni[f], c = game.balance.foedus;
  if (!F?.vivo || F.protettore !== P) return 'non è tuo federato';
  const resta = (F.foedusDal ?? -Infinity) + c.anniIntegrazione * 365 - game.day;
  if (resta > 0) return `foedus da troppo poco: ancora ${Math.ceil(resta / 365)} anni`;
  const rel = relation(game, P, f);
  if (rel < c.relazioneIntegrazione) return `relazione troppo bassa (${rel}, serve ${c.relazioneIntegrazione})`;
  if (Object.values(game.guerre).some(w => sideOf(w, P) || sideOf(w, f))) return 'non durante una guerra';
  const costo = integrationCost(game, f);
  if (game.nazioni[P].tesoro < costo) return `denari insufficienti: servono ${costo}`;
  return null;
}

// Integrazione: il protettore paga e prende in pace tutto il federato, con metà dell'infamia di una conquista.
export function integrate(game, P, f) {
  const err = checkIntegrate(game, P, f);
  if (err) return { ok: false, motivo: err };
  const A = game.nazioni[P], inf = game.balance.infamia;
  A.tesoro -= integrationCost(game, f);
  for (const p of provincesOf(game, f)) {
    A.infamia += (inf.perProvincia + (p.cultura !== A.cultura ? inf.culturaDiversa : 0)) * game.balance.foedus.infamia;
    p.owner = P;
    p.controller = P;
    p.assedio = null;
  }
  for (const a of Object.values(game.eserciti)) if (a.owner === f) { a.owner = P; a.percorso = []; } // i suoi soldati passano al protettore
  log(game, { tipo: 'integrazione', nazione: P, federato: f });
  checkSurvival(game);
  return { ok: true };
}

export function checkRelease(game, P, f) {
  return game.nazioni[f]?.vivo && game.nazioni[f].protettore === P ? null : 'non è tuo federato';
}

export function release(game, P, f) {
  const err = checkRelease(game, P, f);
  if (err) return { ok: false, motivo: err };
  game.nazioni[f].protettore = null;
  changeRelation(game, P, f, game.balance.foedus.relazioneLiberazione);
  log(game, { tipo: 'liberazione', nazione: P, federato: f });
  return { ok: true };
}
