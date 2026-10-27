// Chi decide per ciascun popolo: regole, Jev, oppure metà e metà (posizioni pari a Jev).
import { rulesController } from './rules.js';

export function buildControllers(game, ia, ai, escludi = null) {
  return syncControllers({}, game, ia, ai, escludi);
}

// Dà un controller ai popoli che non l'hanno ancora: all'inizio tutti, poi quelli nati da un'indipendenza.
export function syncControllers(out, game, ia, ai, escludi = null) {
  game.ordine.forEach((id, i) => {
    if (id === escludi || out[id]) return;
    const jev = ia === 'jev' || (ia === 'misto' && i % 2 === 0);
    out[id] = jev && ai && !game.nazioni[id].orda ? ai.controller : rulesController; // le orde vanno sempre a regole
  });
  return out;
}
