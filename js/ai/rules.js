// IA a regole. Legge lo stato e restituisce comandi; non modifica mai lo stato.
// Fa il lavoro di fino (eserciti, reclute) per tutti, e le scelte strategiche quando Jev non c'è.
import { armiesOf, maxManpower, bordersNation } from '../sim/state.js';
import { atWar, inTruce, hasPretext, sideOf, enemiesOf, scoreFor, peaceCost } from '../sim/war.js';
import { distancesFrom } from '../sim/armies.js';
import { stabilityCost } from '../sim/economy.js';
import { isFirstOfMonth } from '../sim/calendar.js';

function hashId(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function isReviewDay(game, id) {
  return game.day % 91 === hashId(id) % 91;
}

export function enemiesOfNation(game, id) {
  return game.ordine.filter(o => game.nazioni[o].vivo && atWar(game, id, o));
}

export function power(game, id) {
  const men = armiesOf(game, id).reduce((s, a) => s + a.fanteria + a.cavalleria, 0);
  return men + game.nazioni[id].uomini * 0.5;
}

export function warCandidates(game, id) {
  const mine = power(game, id);
  return game.ordine
    .filter(o => o !== id && game.nazioni[o].vivo && !inTruce(game, id, o) && !atWar(game, id, o) && bordersNation(game, id, o))
    .map(o => ({ id: o, rapporto: mine / Math.max(1, power(game, o)) }))
    .sort((a, b) => b.rapporto - a.rapporto || a.id.localeCompare(b.id));
}

export function rulesController(game, id) {
  const cmds = [...answerProposals(game, id)];
  if (isReviewDay(game, id)) cmds.push(...strategy(game, id));
  if ((game.day + hashId(id)) % 7 === 0) cmds.push(...armyOrders(game, id));
  if (isFirstOfMonth(game.day)) cmds.push(...recruitment(game, id));
  return cmds;
}

export function strategy(game, id) {
  const n = game.nazioni[id], ia = game.balance.ia;
  const wars = Object.values(game.guerre).filter(w => sideOf(w, id));
  if (!wars.length) {
    const best = warCandidates(game, id)[0];
    if (!best || best.rapporto < ia.rapportoGuerra) return [];
    if (n.infamia >= game.balance.infamia.soglia) return [];
    if (!hasPretext(game, id, best.id) && n.stabilita < 0) return [];
    return [{ tipo: 'dichiara_guerra', nazione: id, contro: best.id }];
  }
  const cmds = [];
  for (const war of wars) {
    const side = sideOf(war, id);
    if (war[side][0] !== id) continue; // decide il capofila
    if (Object.values(game.proposte).some(p => p.guerra === war.id && p.da === id)) continue;
    const enemySide = side === 'attaccanti' ? 'difensori' : 'attaccanti';
    const enemyLeader = enemiesOf(war, side)[0];
    const s = scoreFor(game, war, id);
    const byTax = (a, b) => b.tasse - a.tasse || a.id.localeCompare(b.id);
    if (s >= ia.pacePunteggio) {
      const occupied = Object.values(game.province)
        .filter(p => war[enemySide].includes(p.owner) && war[side].includes(p.controller)).sort(byTax);
      const scelte = [];
      for (const p of occupied) if (peaceCost(game, war, id, { province: [...scelte, p.id] }) <= s) scelte.push(p.id);
      if (scelte.length) cmds.push({ tipo: 'proponi_pace', nazione: id, guerra: war.id, termini: { ricevente: id, province: scelte } });
    } else if (s <= ia.resaPunteggio) {
      const lost = Object.values(game.province)
        .filter(p => war[side].includes(p.owner) && war[enemySide].includes(p.controller)).sort(byTax);
      const scelte = [];
      for (const p of lost) if (peaceCost(game, war, enemyLeader, { province: [...scelte, p.id] }) <= -s) scelte.push(p.id);
      cmds.push({ tipo: 'proponi_pace', nazione: id, guerra: war.id, termini: { ricevente: enemyLeader, province: scelte } });
    } else if (game.day - war.inizio >= ia.paceBiancaAnni * 365 && Math.abs(s) < 10) {
      cmds.push({ tipo: 'proponi_pace', nazione: id, guerra: war.id, termini: { ricevente: id, province: [] } });
    }
  }
  return cmds;
}

// Accetta ciò che riceve; cede solo se il costo non supera di 10 il vantaggio del nemico.
export function answerProposals(game, id) {
  const cmds = [];
  for (const p of Object.values(game.proposte)) {
    if (p.a !== id) continue;
    const war = game.guerre[p.guerra];
    let accetta = true;
    if (p.termini.ricevente !== id) {
      accetta = peaceCost(game, war, p.termini.ricevente, p.termini) <= -scoreFor(game, war, id) + 10;
    }
    cmds.push({ tipo: 'rispondi', nazione: id, proposta: p.id, accetta });
  }
  return cmds;
}

export function armyOrders(game, id) {
  const cmds = [];
  const enemies = enemiesOfNation(game, id);
  const capital = game.nazioni[id].capitale;
  for (const a of armiesOf(game, id)) {
    if (a.inBattaglia || a.percorso.length) continue;
    if (!enemies.length) {
      if (a.prov !== capital) cmds.push({ tipo: 'muovi', nazione: id, esercito: a.id, verso: capital });
      continue;
    }
    const here = game.province[a.prov];
    if (here.controller !== id && enemies.includes(here.controller)) continue; // sta assediando
    if (a.morale < game.balance.combattimento.moraleMax / 2) continue; // si riprende
    const targets = Object.values(game.province).filter(p =>
      (p.owner === id && enemies.includes(p.controller)) || (enemies.includes(p.owner) && p.controller !== id));
    const { dist } = distancesFrom(game, id, a.prov);
    let best = null;
    for (const p of targets) {
      if (dist[p.id] === undefined) continue;
      if (best === null || dist[p.id] < dist[best] || (dist[p.id] === dist[best] && p.id < best)) best = p.id;
    }
    if (best) cmds.push({ tipo: 'muovi', nazione: id, esercito: a.id, verso: best });
  }
  return cmds;
}

export function recruitment(game, id) {
  const n = game.nazioni[id], ia = game.balance.ia, c = game.balance.costi;
  const cmds = [];
  const men = armiesOf(game, id).reduce((s, a) => s + a.fanteria + a.cavalleria, 0);
  const deficit = Math.round(maxManpower(game, id) * ia.esercitoObiettivo) - men;
  const capital = game.province[n.capitale];
  if (deficit > 0 && n.uomini >= ia.reclutaSoglia && capital.controller === id) {
    const total = Math.floor(Math.min(n.uomini, deficit) / 100) * 100;
    const cavalleria = Math.round(total * 0.1), fanteria = total - cavalleria;
    const costo = fanteria / 1000 * c.fanteria1000 + cavalleria / 1000 * c.cavalleria1000;
    if (total > 0 && n.tesoro >= costo + ia.riservaTesoro) {
      cmds.push({ tipo: 'recluta', nazione: id, provincia: n.capitale, fanteria, cavalleria });
    }
  }
  if (!cmds.length && n.stabilita < 1 && !enemiesOfNation(game, id).length &&
      n.tesoro >= stabilityCost(game, id) + ia.riservaTesoro) {
    cmds.push({ tipo: 'alza_stabilita', nazione: id });
  }
  return cmds;
}
