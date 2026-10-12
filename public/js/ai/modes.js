// Chi decide per ciascun popolo: regole, Jev, oppure metà e metà (posizioni pari a Jev).
import { rulesController } from './rules.js';

export function buildControllers(game, ia, ai, escludi = null) {
  const out = {};
  game.ordine.forEach((id, i) => {
    if (id === escludi) return;
    const jev = ia === 'jev' || (ia === 'misto' && i % 2 === 0);
    out[id] = jev && ai ? ai.controller : rulesController;
  });
  return out;
}
