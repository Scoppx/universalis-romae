// Economia mensile e aggiornamenti annuali.
import { provincesOf, sumOf, armiesOf, maxManpower, governmentOf, taxBonus, recruitBonus } from './state.js';
import { nextRandom } from './rng.js';

function paying(game, id) {
  return provincesOf(game, id).filter(p => p.controller === id);
}

export function monthlyIncome(game, id) {
  const n = game.nazioni[id], b = game.balance.economia;
  return sumOf(paying(game, id), 'tasse') * b.tasseMese * (1 + n.stabilita * b.stabilitaEntrate) * (1 + taxBonus(game, id));
}

export function monthlyUpkeep(game, id) {
  const men = armiesOf(game, id).reduce((s, a) => s + (a.fanteria + a.cavalleria * 2) / 1000, 0);
  return men * game.balance.economia.mantenimento1000;
}

export function monthlyManpower(game, id) {
  return Math.round(sumOf(paying(game, id), 'uomini') * game.balance.economia.uominiMese * (1 + recruitBonus(game, id)));
}

export function monthlyEconomy(game) {
  const b = game.balance.economia;
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    if (!n.vivo) continue;
    n.tesoro += monthlyIncome(game, id) - monthlyUpkeep(game, id);
    const regen = monthlyManpower(game, id);
    n.uomini = Math.min(maxManpower(game, id), n.uomini + regen);
    if (n.tesoro < 0) {
      for (const a of armiesOf(game, id)) {
        a.fanteria = Math.floor(a.fanteria * (1 - b.diserzioneDebito));
        a.cavalleria = Math.floor(a.cavalleria * (1 - b.diserzioneDebito));
      }
    }
  }
}

// La stabilità tende all'equilibrio del governo (0, +1 per la monarchia): risale più in fretta e scende più piano con il tratto "stabilita".
export function yearlyUpdate(game) {
  const b = game.balance;
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    if (!n.vivo) continue;
    const t = n.tratti.stabilita || 0, eq = governmentOf(game, id).equilibrioStabilita ?? 0;
    if (n.stabilita < eq && nextRandom(game) < b.stabilita.derivaAnno * (1 + t)) n.stabilita += 1;
    else if (n.stabilita > eq && nextRandom(game) < b.stabilita.derivaAnno * Math.max(0, 1 - t)) n.stabilita -= 1;
    n.infamia = Math.max(0, n.infamia - b.infamia.caloAnno);
  }
}

export function stabilityCost(game, id) {
  const c = game.balance.costi;
  return c.stabilitaBase + c.stabilitaPerTassa * sumOf(provincesOf(game, id), 'tasse');
}

export function raiseStability(game, id) {
  const n = game.nazioni[id];
  if (!n?.vivo) return { ok: false, motivo: 'nazione inesistente' };
  if (n.stabilita >= 3) return { ok: false, motivo: 'stabilità al massimo' };
  const cost = stabilityCost(game, id);
  if (n.tesoro < cost) return { ok: false, motivo: 'denaro insufficiente' };
  n.tesoro -= cost;
  n.stabilita += 1;
  return { ok: true };
}
