// Battaglie giornaliere: ogni giorno un dado 0-9 per parte più i modificatori.
import { rollD10 } from './rng.js';
import { armyStrength, clamp, log, sliderOf, RIBELLI } from './state.js';
import { atWar, warBetween, sideOf } from './war.js';
import { friendly } from './diplomacy.js';

export function resolveBattles(game) {
  for (const a of Object.values(game.eserciti)) a.inBattaglia = false;
  const byProv = {};
  for (const a of Object.values(game.eserciti)) (byProv[a.prov] ??= []).push(a);
  for (const [provId, armies] of Object.entries(byProv)) {
    if (armies.length < 2) continue;
    // la prima coppia in guerra, in ordine stabile: un terzo neutrale non blocca la battaglia
    let first = null, enemy = null;
    for (const x of armies) {
      enemy = armies.find(y => atWar(game, x.owner, y.owner));
      if (enemy) { first = x; break; }
    }
    if (!enemy) continue;
    if (first.owner === RIBELLI || enemy.owner === RIBELLI) {
      // contro i ribelli combatte chi li ha trovati, insieme ai suoi amici
      const altro = first.owner === RIBELLI ? enemy.owner : first.owner;
      battleDay(game, provId, armies.filter(x => x.owner === RIBELLI),
        armies.filter(x => x.owner === altro || (x.owner !== RIBELLI && friendly(game, x.owner, altro))));
      continue;
    }
    // tutti gli eserciti dello stesso lato della guerra combattono insieme
    const war = warBetween(game, first.owner, enemy.owner);
    const lato = sideOf(war, first.owner), altro = sideOf(war, enemy.owner);
    battleDay(game, provId,
      armies.filter(x => sideOf(war, x.owner) === lato),
      armies.filter(x => sideOf(war, x.owner) === altro));
  }
}

function men(side) {
  return side.reduce((s, a) => s + a.fanteria + a.cavalleria, 0);
}

export function battleModifier(game, prov, side) {
  const owner = side[0].owner, n = game.nazioni[owner], t = n.tratti, c = game.balance.combattimento;
  let m = t.battaglia || 0;
  const controlla = side.some(a => a.owner === prov.controller);
  if (controlla) m += c.terreno[prov.terreno];
  if (prov.terreno === 'montagna') m += t.montagna || 0;
  if (n.stabilita >= c.stabilitaDado) m += 1;
  else if (n.stabilita <= -c.stabilitaDado) m -= 1;
  const g = sliderOf(game, owner).guerra, e = game.balance.slider.estremoGuerra;
  if (g >= e && !controlla) m += 1; // dottrina offensiva: meglio in terra nemica
  if (g <= -e && controlla) m += 1; // dottrina difensiva: meglio in casa
  return m;
}

function applyLosses(side, losses, moraleLoss) {
  const total = men(side);
  for (const a of side) {
    const n = a.fanteria + a.cavalleria;
    if (!n) continue;
    const share = losses * n / total;
    a.fanteria -= Math.min(a.fanteria, Math.round(share * a.fanteria / n));
    a.cavalleria -= Math.min(a.cavalleria, Math.round(share * a.cavalleria / n));
    a.morale = Math.max(0, a.morale - moraleLoss);
  }
}

export function battleDay(game, provId, sideA, sideB) {
  const prov = game.province[provId], c = game.balance.combattimento;
  for (const a of [...sideA, ...sideB]) a.inBattaglia = true;
  const strength = side => side.reduce((s, a) => s + armyStrength(game, a), 0);
  const sA = strength(sideA), sB = strength(sideB);
  const rA = rollD10(game) + battleModifier(game, prov, sideA) + 1;
  const rB = rollD10(game) + battleModifier(game, prov, sideB) + 1;
  applyLosses(sideB, sA * rA * c.perdite, rA * c.morale * clamp(sA / Math.max(1, sB), 0.5, 2));
  applyLosses(sideA, sB * rB * c.perdite, rB * c.morale * clamp(sB / Math.max(1, sA), 0.5, 2));
  const beaten = side => side.every(a => a.morale <= 0 || a.fanteria + a.cavalleria < c.minimoUomini);
  const aLost = beaten(sideA), bLost = beaten(sideB);
  if (!aLost && !bLost) return null;
  // se cadono entrambe, perde chi ha meno uomini
  const loser = aLost && bLost ? (men(sideA) <= men(sideB) ? sideA : sideB) : (aLost ? sideA : sideB);
  const winner = loser === sideA ? sideB : sideA;
  recordBattle(game, winner[0].owner, loser[0].owner);
  log(game, { tipo: 'battaglia', prov: provId, vincitore: winner[0].owner, sconfitto: loser[0].owner });
  for (const a of loser) retreat(game, a);
  return winner[0].owner;
}

function recordBattle(game, winner, loser) {
  const war = warBetween(game, winner, loser);
  if (!war) return;
  const g = game.balance.guerra;
  const delta = sideOf(war, winner) === 'attaccanti' ? g.puntiBattaglia : -g.puntiBattaglia;
  war.battaglie = clamp(war.battaglie + delta, -g.maxBattaglie, g.maxBattaglie);
}

// Ritirata nella provincia propria più vicina, controllata e senza nemici; altrimenti si scioglie.
export function retreat(game, army) {
  if (army.fanteria + army.cavalleria < game.balance.combattimento.minimoUomini) {
    delete game.eserciti[army.id];
    return;
  }
  const safe = id => {
    const p = game.province[id];
    return p.owner === army.owner && p.controller === army.owner &&
      !Object.values(game.eserciti).some(e => e.prov === id && atWar(game, army.owner, e.owner));
  };
  const seen = new Set([army.prov]);
  let frontier = [army.prov];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      for (const v of game.province[id].vicini) {
        if (seen.has(v)) continue;
        seen.add(v);
        if (safe(v)) {
          army.prov = v;
          army.percorso = [];
          army.morale = 0;
          return;
        }
        next.push(v);
      }
    }
    frontier = next;
  }
  delete game.eserciti[army.id];
}

export function recoverMorale(game) {
  const c = game.balance.combattimento;
  for (const a of Object.values(game.eserciti)) {
    if (!a.inBattaglia) a.morale = Math.min(c.moraleMax, a.morale + c.recuperoMorale);
  }
}
