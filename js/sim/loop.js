// Un giorno di simulazione. Ordine fisso: decisioni, movimento, battaglie, assedi, morale,
// scadenze; poi, sul giorno nuovo, economia, diplomazia, cultura ed eventi mensili e aggiornamento annuale.
import { applyCommand } from './commands.js';
import { advanceMovement, mergeArrivals } from './armies.js';
import { resolveBattles, recoverMorale } from './combat.js';
import { advanceSieges } from './siege.js';
import { expireProposals } from './war.js';
import { monthlyEconomy, yearlyUpdate } from './economy.js';
import { monthlyDiplomacy } from './diplomacy.js';
import { monthlyCulture } from './culture.js';
import { monthlyEvents, expireEvents } from './events.js';
import { isFirstOfMonth, isNewYear, END_DAY } from './calendar.js';

export function advanceDay(game, controllers = {}) {
  game.log = [];
  for (const id of game.ordine) {
    if (!game.nazioni[id].vivo || !controllers[id]) continue;
    for (const cmd of controllers[id](game, id)) {
      if (cmd.nazione === id) applyCommand(game, cmd); // ognuno comanda solo per sé
    }
  }
  advanceMovement(game);
  mergeArrivals(game);
  resolveBattles(game);
  advanceSieges(game);
  recoverMorale(game);
  expireProposals(game);
  expireEvents(game);
  game.day += 1;
  if (isFirstOfMonth(game.day)) { monthlyEconomy(game); monthlyDiplomacy(game); monthlyCulture(game); monthlyEvents(game); }
  if (isNewYear(game.day)) yearlyUpdate(game);
  return game.log;
}

export function isOver(game) {
  return game.day >= END_DAY;
}
