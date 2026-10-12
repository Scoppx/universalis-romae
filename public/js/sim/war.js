// Guerre: dichiarazione, lati, tregue. Punteggio, pace e proposte sotto.
import { newId, log, bordersNation } from './state.js';

export function sideOf(war, id) {
  if (war.attaccanti.includes(id)) return 'attaccanti';
  if (war.difensori.includes(id)) return 'difensori';
  return null;
}

export function enemiesOf(war, side) {
  return side === 'attaccanti' ? war.difensori : war.attaccanti;
}

export function warBetween(game, a, b) {
  return Object.values(game.guerre).find(w => {
    const sa = sideOf(w, a), sb = sideOf(w, b);
    return sa && sb && sa !== sb;
  }) || null;
}

export function atWar(game, a, b) {
  return a !== b && warBetween(game, a, b) !== null;
}

export function hasPretext(game, attacker, defender) {
  return game.nazioni[defender].infamia > game.balance.infamia.soglia;
}

export function inTruce(game, a, b) {
  return (game.nazioni[a].tregue[b] ?? -1) > game.day;
}

export function declareWar(game, attacker, defender) {
  const A = game.nazioni[attacker], D = game.nazioni[defender];
  if (!A?.vivo || !D?.vivo || attacker === defender) return { ok: false, motivo: 'nazione non valida' };
  if (atWar(game, attacker, defender)) return { ok: false, motivo: 'già in guerra' };
  if (inTruce(game, attacker, defender)) return { ok: false, motivo: 'tregua in corso' };
  if (!bordersNation(game, attacker, defender)) return { ok: false, motivo: 'nessun confine' };
  if (!hasPretext(game, attacker, defender)) A.stabilita = Math.max(-3, A.stabilita - game.balance.guerra.senzaPretesto);
  const id = newId(game, 'g');
  game.guerre[id] = { id, attaccanti: [attacker], difensori: [defender], inizio: game.day, battaglie: 0 };
  log(game, { tipo: 'guerra', guerra: id, attaccante: attacker, difensore: defender });
  return { ok: true, guerra: id };
}
