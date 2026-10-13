// Diplomazia: relazioni, ambascerie, alleanze, foedus, tributi, ultimatum, pretesti, coalizioni, chiamate alle armi.
import { clamp } from './state.js';
import { atWar } from './war.js';

const D = game => game.balance.diplomazia;

export function baseRelation(game, a, b) {
  return game.nazioni[a].cultura === game.nazioni[b].cultura ? D(game).relazioneStessaCultura : 0;
}

// Valori iniziali dei campi diplomatici; non tocca quelli già presenti (salvataggi vecchi, popoli nuovi).
export function initDiplomacy(game) {
  for (const a of game.ordine) {
    const n = game.nazioni[a];
    n.relazioni ??= {};
    for (const b of game.ordine) if (a !== b && n.relazioni[b] === undefined) n.relazioni[b] = baseRelation(game, a, b);
    n.alleati ??= [];
    n.protettore ??= null;
    n.tributo ??= null;
    n.pretesti ??= {};
    n.ambascerie ??= {};
  }
}

export function relation(game, a, b) {
  return game.nazioni[a].relazioni[b] ?? baseRelation(game, a, b);
}

export function changeRelation(game, a, b, delta) {
  const v = clamp(relation(game, a, b) + delta, -200, 200);
  game.nazioni[a].relazioni[b] = v;
  game.nazioni[b].relazioni[a] = v;
}

export function checkEmbassy(game, from, to) {
  const A = game.nazioni[from];
  if (!A?.vivo || !game.nazioni[to]?.vivo || from === to) return 'popolo non valido';
  if (game.day - (A.ambascerie[to] ?? -Infinity) < D(game).ambasceriaAttesa) return 'ambasceria già inviata quest\'anno';
  if (A.tesoro < D(game).ambasceriaCosto) return 'denaro insufficiente';
  return null;
}

export function embassy(game, from, to) {
  const err = checkEmbassy(game, from, to);
  if (err) return { ok: false, motivo: err };
  const A = game.nazioni[from];
  A.tesoro -= D(game).ambasceriaCosto;
  A.ambascerie[to] = game.day;
  changeRelation(game, from, to, D(game).ambasceriaEffetto);
  return { ok: true };
}

export function monthlyDiplomacy(game) {
  const d = D(game);
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    if (!n.vivo) continue;
    n.alleati = n.alleati.filter(x => game.nazioni[x].vivo);
    for (const o of game.ordine) {
      if (o <= id || !game.nazioni[o].vivo || atWar(game, id, o)) continue; // ogni coppia una volta
      const v = relation(game, id, o), b = baseRelation(game, id, o);
      if (v !== b) changeRelation(game, id, o, Math.sign(b - v) * Math.min(d.derivaMese, Math.abs(b - v)));
    }
  }
}
