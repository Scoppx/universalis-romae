// Stato di una partita. La simulazione lo modifica sul posto; è JSON puro, quindi si salva
// con JSON.stringify e si ricarica con JSON.parse.
// game = {
//   day, rng, nextId, balance,
//   province: { [id]: { id, nome, owner, controller, cultura, terreno, tasse, uomini, fort, vicini: [id] } },
//   stretti: ['a|b'],
//   nazioni: { [id]: { id, nome, colore, cultura, governo, capitale, tesoro, uomini, stabilita, infamia,
//                      tratti, vivo, tregue: { [id]: giornoFine } } },
//   ordine: [id],                 // ordine stabile delle nazioni attive (quello di popoli.json)
//   eserciti: { [id]: { id, owner, prov, fanteria, cavalleria, morale, percorso: [id], giorniAlProssimo, inBattaglia } },
//   guerre: { [id]: { id, attaccanti: [id], difensori: [id], inizio, battaglie } },
//   proposte: { [id]: { id, tipo: 'pace', guerra, da, a, termini: { ricevente, province: [id] }, giorno } },
//   log: [{ day, tipo, ... }]     // eventi del giorno corrente
// }
import { createArmy, provincesOf, sumOf, strettoKey, maxManpower } from './state.js';

export function createGame({ map, popoli, balance, seed }) {
  const game = {
    day: 0, rng: seed >>> 0, nextId: 1, balance,
    province: {}, stretti: [], nazioni: {}, ordine: [],
    eserciti: {}, guerre: {}, proposte: {}, log: []
  };
  for (const p of map.province) {
    game.province[p.id] = {
      id: p.id, nome: p.nome, owner: p.owner, controller: p.owner, cultura: p.cultura,
      terreno: p.terreno, tasse: p.tasse, uomini: p.uomini, fort: p.fort, vicini: [...p.vicini]
    };
  }
  game.stretti = (map.stretti || []).map(([a, b]) => strettoKey(a, b));
  for (const n of popoli.popoli) {
    if (n.dormiente) continue;
    game.ordine.push(n.id);
    game.nazioni[n.id] = {
      id: n.id, nome: n.nome, colore: n.colore, cultura: n.cultura, governo: n.governo,
      capitale: n.capitale, tesoro: 0, uomini: 0, stabilita: 0, infamia: 0,
      tratti: { ...n.tratti }, vivo: true, tregue: {}, obiettivo: null
    };
  }
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    const owned = provincesOf(game, id);
    const bonus = 1 + (n.tratti.reclute || 0);
    const uomini = sumOf(owned, 'uomini');
    n.tesoro = sumOf(owned, 'tasse') * balance.economia.tasseMese * balance.inizio.tesoroMesi;
    n.uomini = Math.round(maxManpower(game, id) * balance.inizio.riservaQuota);
    createArmy(game, id, n.capitale,
      Math.round(uomini * balance.inizio.fanteriaPerUomo * bonus),
      Math.round(uomini * balance.inizio.cavalleriaPerUomo * bonus));
  }
  return game;
}
