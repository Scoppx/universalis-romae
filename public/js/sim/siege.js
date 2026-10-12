// Assedi: ogni giorno un esercito fermo in una provincia nemica ha una probabilità di prenderla.
import { nextRandom } from './rng.js';
import { log } from './state.js';
import { atWar } from './war.js';

export function siegeChance(game, army, prov) {
  const s = game.balance.assedio, t = game.nazioni[army.owner].tratti;
  const base = Math.min(s.massimo, s.base * (army.fanteria + army.cavalleria) / 1000 / (prov.fort + 1));
  return base * (1 + (t.assedio || 0));
}

export function advanceSieges(game) {
  for (const a of Object.values(game.eserciti)) {
    if (a.inBattaglia || a.percorso.length) continue;
    const p = game.province[a.prov];
    if (p.controller === a.owner || !atWar(game, a.owner, p.controller)) continue;
    if (Object.values(game.eserciti).some(e => e.prov === p.id && atWar(game, a.owner, e.owner))) continue;
    if (nextRandom(game) < siegeChance(game, a, p)) {
      p.controller = a.owner;
      log(game, { tipo: 'assedio', prov: p.id, nazione: a.owner });
    }
  }
}
