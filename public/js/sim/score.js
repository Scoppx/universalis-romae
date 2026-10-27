// Punteggio di fine partita: tasse possedute più un bonus per le province della propria cultura e per l'ambizione raggiunta.
import { provincesOf } from './state.js';
import { ambitionBonus } from './ambitions.js';

export function score(game, id) {
  const n = game.nazioni[id], bonus = game.balance.punteggio.culturaPropria;
  return provincesOf(game, id).reduce((s, p) => s + p.tasse + (p.cultura === n.cultura ? bonus : 0), 0) + ambitionBonus(game, id);
}

export function ranking(game) {
  return game.ordine
    .map(id => ({ id, punteggio: score(game, id), vivo: game.nazioni[id].vivo }))
    .sort((a, b) => b.punteggio - a.punteggio || a.id.localeCompare(b.id));
}
