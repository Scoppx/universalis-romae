// Un giorno di simulazione. Ordine fisso: decisioni, movimento, battaglie, assedi, morale,
// scadenze; poi, sul giorno nuovo, economia mensile e aggiornamento annuale.
import { applyCommand } from './commands.js';
import { advanceMovement } from './armies.js';
import { resolveBattles, recoverMorale } from './combat.js';
import { advanceSieges } from './siege.js';
import { expireProposals } from './war.js';
import { monthlyEconomy, yearlyUpdate } from './economy.js';
import { isFirstOfMonth, isNewYear, END_DAY } from './calendar.js';

export function advanceDay(game, controllers = {}) {
  game.log = [];
  for (const id of game.ordine) {
    if (!game.nazioni[id].vivo || !controllers[id]) continue;
    for (const cmd of controllers[id](game, id)) applyCommand(game, cmd);
  }
  advanceMovement(game);
  resolveBattles(game);
  advanceSieges(game);
  recoverMorale(game);
  expireProposals(game);
  game.day += 1;
  if (isFirstOfMonth(game.day)) monthlyEconomy(game);
  if (isNewYear(game.day)) yearlyUpdate(game);
  return game.log;
}

export function isOver(game) {
  return game.day >= END_DAY;
}
