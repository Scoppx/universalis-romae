// IA a regole. Legge lo stato e restituisce comandi; non modifica mai lo stato.
// Fa il lavoro di fino (eserciti, reclute) per tutti, e le scelte strategiche quando Jev non c'è.
import { armiesOf, maxManpower, bordersNation, power, RIBELLI, provincesOf } from '../sim/state.js';
import { checkSlider } from '../sim/government.js';
import { malcontent, checkColony, colonyCost } from '../sim/culture.js';

export { power };
import { atWar, inTruce, hasPretext, sideOf, enemiesOf, scoreFor, peaceCost } from '../sim/war.js';
import { distancesFrom } from '../sim/armies.js';
import { relation, friendly, checkProposal, checkEmbassy, checkLeaveFoedus } from '../sim/diplomacy.js';
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

export function isSliderDay(game, id) {
  return game.day % 365 === hashId(id) % 365;
}

// Riforme a regole: prima calmare le province scontente, poi la dottrina secondo i vicini, poi la società secondo i bisogni.
export function sliderDecision(game, id) {
  const n = game.nazioni[id], soglia = game.balance.cultura.sogliaRivolta;
  const mosse = [];
  if (provincesOf(game, id).some(p => malcontent(game, p.id) > soglia)) mosse.push(['governo', 1]);
  const minaccia = game.ordine.some(o => o !== id && game.nazioni[o].vivo && bordersNation(game, id, o) && power(game, o) > power(game, id));
  mosse.push(['guerra', minaccia ? -1 : 1]);
  mosse.push(['societa', n.uomini < maxManpower(game, id) / 2 ? 1 : -1]);
  const m = mosse.find(([q, v]) => !checkSlider(game, id, q, v));
  return m ? [{ tipo: 'slider', nazione: id, quale: m[0], verso: m[1] }] : [];
}

// Una colonia nella provincia straniera più ricca, in pace e con denaro e uomini che avanzano.
export function colonyDecision(game, id) {
  const n = game.nazioni[id], ia = game.balance.ia, c = game.balance.cultura;
  if (enemiesOfNation(game, id).length || n.uomini < c.coloniaUomini + ia.reclutaSoglia) return [];
  const p = provincesOf(game, id)
    .filter(p => !checkColony(game, id, p.id) && n.tesoro >= colonyCost(game, p.id) + ia.riservaColonia)
    .sort((a, b) => b.tasse - a.tasse || (a.id < b.id ? -1 : 1))[0];
  return p ? [{ tipo: 'colonia', nazione: id, provincia: p.id }] : [];
}

export function enemiesOfNation(game, id) {
  return game.ordine.filter(o => game.nazioni[o].vivo && atWar(game, id, o));
}

export function warCandidates(game, id) {
  const mine = power(game, id);
  return game.ordine
    .filter(o => o !== id && game.nazioni[o].vivo && !inTruce(game, id, o) && !atWar(game, id, o) && !friendly(game, id, o) && bordersNation(game, id, o))
    .map(o => ({ id: o, rapporto: mine / Math.max(1, power(game, o)) }))
    .sort((a, b) => b.rapporto - a.rapporto || a.id.localeCompare(b.id));
}

// Lavoro di fino, uguale per regole e Jev: eserciti ogni 7 giorni (sfalsati) e reclute il primo del mese.
export function routine(game, id) {
  const cmds = [];
  // in pace un obiettivo di guerra non vale più
  const inWar = Object.values(game.guerre).some(w => sideOf(w, id));
  if (!inWar && game.nazioni[id].obiettivo != null) cmds.push({ tipo: 'obiettivo', nazione: id, provincia: null });
  if ((game.day + hashId(id)) % 7 === 0) cmds.push(...armyOrders(game, id));
  if (isFirstOfMonth(game.day)) cmds.push(...recruitment(game, id));
  return cmds;
}

export function rulesController(game, id) {
  const cmds = [...answerProposals(game, id)];
  // le regole non usano obiettivi: uno rimasto da Jev (o da un salvataggio) si azzera; in pace lo fa la routine
  const inWar = Object.values(game.guerre).some(w => sideOf(w, id));
  if (inWar && game.nazioni[id].obiettivo != null) cmds.push({ tipo: 'obiettivo', nazione: id, provincia: null });
  if (isSliderDay(game, id)) cmds.push(...sliderDecision(game, id));
  if (isReviewDay(game, id)) cmds.push(...strategy(game, id), ...colonyDecision(game, id));
  cmds.push(...routine(game, id));
  return cmds;
}

export function strategy(game, id) {
  const inWar = Object.values(game.guerre).some(w => sideOf(w, id));
  if (inWar) return peaceProposals(game, id);
  const ult = ultimatumDecision(game, id);
  if (ult.length) return ult;
  const war = warDecision(game, id);
  return war.length ? war : diplomacyInitiatives(game, id);
}

// Contro un vicino molto più debole prima si chiede una provincia: se rifiuta, la guerra avrà un pretesto.
export function ultimatumDecision(game, id) {
  const d = game.balance.diplomazia;
  const best = legalWarTargets(game, id)[0];
  if (!best || best.rapporto < d.ultimatumRapporto || hasPretext(game, id, best.id)) return [];
  const prov = Object.values(game.province)
    .filter(p => !checkProposal(game, id, 'ultimatum', best.id, { provincia: p.id }))
    .sort((a, b) => b.tasse - a.tasse || (a.id < b.id ? -1 : 1))[0];
  return prov ? [{ tipo: 'proponi', nazione: id, genere: 'ultimatum', verso: best.id, provincia: prov.id }] : [];
}

export function diplomacyInitiatives(game, id) {
  const n = game.nazioni[id], d = game.balance.diplomazia, mine = power(game, id);
  // un federato che è diventato più forte del suo protettore se ne va
  if (n.protettore) return mine > power(game, n.protettore) && !checkLeaveFoedus(game, id) ? [{ tipo: 'esci_foedus', nazione: id }] : [];
  const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const vicini = game.ordine.filter(o => o !== id && game.nazioni[o].vivo && bordersNation(game, id, o) && !atWar(game, id, o));
  const foedus = vicini.filter(o => !checkProposal(game, id, 'foedus', o)).sort(byId)[0];
  if (foedus) return [{ tipo: 'proponi', nazione: id, genere: 'foedus', verso: foedus }];
  if (vicini.some(o => power(game, o) > mine * 1.2 && !friendly(game, id, o))) {
    const amico = vicini
      .filter(o => power(game, o) <= mine * 1.2 && relation(game, id, o) >= d.alleanzaMinRelazione && !checkProposal(game, id, 'alleanza', o))
      .sort((a, b) => power(game, b) - power(game, a) || byId(a, b))[0];
    if (amico) return [{ tipo: 'proponi', nazione: id, genere: 'alleanza', verso: amico }];
  }
  const forte = vicini.filter(o => relation(game, id, o) < 50).sort((a, b) => power(game, b) - power(game, a) || byId(a, b))[0];
  if (forte && !checkEmbassy(game, id, forte) && n.tesoro >= d.ambasceriaCosto + game.balance.ia.riservaTesoro) {
    return [{ tipo: 'ambasceria', nazione: id, verso: forte }];
  }
  return [];
}

// Vicini che il codice permette di attaccare: sotto la soglia d'infamia, e con pretesto o stabilità non negativa.
export function legalWarTargets(game, id) {
  const n = game.nazioni[id];
  if (n.protettore) return [];
  if (n.infamia >= game.balance.infamia.soglia) return [];
  return warCandidates(game, id).filter(c => hasPretext(game, id, c.id) || n.stabilita >= 0);
}

export function warDecision(game, id) {
  const best = legalWarTargets(game, id)[0];
  if (!best || best.rapporto < game.balance.ia.rapportoGuerra) return [];
  return [{ tipo: 'dichiara_guerra', nazione: id, contro: best.id }];
}

export function peaceProposals(game, id) {
  const ia = game.balance.ia;
  const cmds = [];
  for (const war of Object.values(game.guerre).filter(w => sideOf(w, id))) {
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

// Pace: accetta ciò che riceve, cede solo se il costo non supera di 10 il vantaggio del nemico.
// Altri tipi: relazioni e rapporti di forze.
export function answerProposals(game, id) {
  const d = game.balance.diplomazia;
  const cmds = [];
  for (const p of Object.values(game.proposte)) {
    if (p.a !== id) continue;
    let accetta;
    switch (p.tipo) {
      case 'pace': {
        const war = game.guerre[p.guerra];
        accetta = p.termini.ricevente === id ||
          peaceCost(game, war, p.termini.ricevente, p.termini) <= -scoreFor(game, war, id) + 10;
        break;
      }
      case 'alleanza': accetta = relation(game, id, p.da) >= d.alleanzaMinRelazione; break;
      case 'foedus': accetta = relation(game, id, p.da) >= d.foedusMinRelazione; break;
      case 'tributo': accetta = power(game, p.da) >= 2 * power(game, id); break;
      case 'ultimatum': accetta = power(game, p.da) >= d.ultimatumRapporto * power(game, id); break;
      case 'chiamata': accetta = relation(game, id, p.da) >= d.chiamataMinRelazione; break;
      default: accetta = false;
    }
    cmds.push({ tipo: 'rispondi', nazione: id, proposta: p.id, accetta });
  }
  return cmds;
}

export function armyOrders(game, id) {
  const cmds = [];
  const enemies = enemiesOfNation(game, id);
  const capital = game.nazioni[id].capitale;
  // province proprie tenute o invase dai ribelli: si reprimono anche in pace
  const rivolte = Object.values(game.province).filter(p => p.owner === id &&
    (p.controller === RIBELLI || Object.values(game.eserciti).some(e => e.prov === p.id && e.owner === RIBELLI)));
  for (const a of armiesOf(game, id)) {
    if (a.inBattaglia || a.percorso.length) continue;
    if (!enemies.length && !rivolte.length) {
      if (a.prov !== capital) cmds.push({ tipo: 'muovi', nazione: id, esercito: a.id, verso: capital });
      continue;
    }
    const here = game.province[a.prov];
    if (here.controller !== id && (enemies.includes(here.controller) || (here.controller === RIBELLI && here.owner === id))) continue; // sta assediando
    if (a.morale < game.balance.combattimento.moraleMax / 2) continue; // si riprende
    // solo province tenute da un nemico: quelle occupate da un terzo non si possono assediare
    const nemiche = Object.values(game.province).filter(p =>
      enemies.includes(p.controller) && (p.owner === id || enemies.includes(p.owner)));
    const targets = [...nemiche, ...rivolte.filter(p => !nemiche.includes(p))];
    const { dist } = distancesFrom(game, id, a.prov);
    // obiettivo deciso dal consiglio: un bersaglio nemico, oppure la capitale da presidiare
    const ob = game.nazioni[id].obiettivo;
    const obValido = ob && dist[ob] !== undefined && (targets.some(p => p.id === ob) ||
      (ob === capital && game.province[ob].owner === id && game.province[ob].controller === id));
    let best = obValido ? ob : null;
    if (!best) {
      for (const p of targets) {
        if (dist[p.id] === undefined) continue;
        if (best === null || dist[p.id] < dist[best] || (dist[p.id] === dist[best] && p.id < best)) best = p.id;
      }
    }
    if (best && best !== a.prov) cmds.push({ tipo: 'muovi', nazione: id, esercito: a.id, verso: best });
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
