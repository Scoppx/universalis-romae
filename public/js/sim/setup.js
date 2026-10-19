// Stato di una partita. La simulazione lo modifica sul posto; è JSON puro, quindi si salva
// con JSON.stringify e si ricarica con JSON.parse.
// game = {
//   day, rng, nextId, balance,
//   province: { [id]: { id, nome, owner, controller, cultura, terreno, tasse, uomini, fort, vicini: [id],
//                       assimilazione, assimilazioneDi, colonia: id|null, ribelliDal: giorno|null } },
//   stretti: ['a|b'],
//   nazioni: { [id]: { id, nome, colore, cultura, governo, capitale, tesoro, uomini, stabilita, infamia,
//                      tratti, vivo, tregue: { [id]: giornoFine }, slider: { societa, guerra, governo }, ultimoSlider } },
//   ordine: [id],                 // ordine stabile delle nazioni attive (quello di popoli.json)
//   eserciti: { [id]: { id, owner, prov, fanteria, cavalleria, morale, percorso: [id], giorniAlProssimo, inBattaglia } },
//   guerre: { [id]: { id, attaccanti: [id], difensori: [id], inizio, battaglie } },
//   proposte: { [id]: { id, tipo: 'pace', guerra, da, a, termini: { ricevente, province: [id] }, giorno } },
//   log: [{ day, tipo, ... }],    // eventi del giorno corrente
//   catalogo: [evento],           // definizioni degli eventi, ordinate per id (non si salva)
//   eventi: { [id]: { id, evento, nazione, altro, giorno } },   // eventi in attesa di una scelta
//   eventiFatti: { [eventoId]: [nazione] },
//   dormienti: { [id]: { id, nome, colore, cultura, governo, capitale, tratti } }   // popoli che un evento può risvegliare
// }
import { createArmy, provincesOf, sumOf, strettoKey, maxManpower, recruitBonus, difficultyOf } from './state.js';
import { initDiplomacy } from './diplomacy.js';
import { initGovernment } from './government.js';
import { initCulture } from './culture.js';

export function createGame({ map, popoli, balance, ambizioni = null, catalogo = [], seed }) {
  const game = {
    day: 0, rng: seed >>> 0, nextId: 1, balance, ambizioni,
    province: {}, stretti: [], nazioni: {}, ordine: [],
    eserciti: {}, guerre: {}, proposte: {}, log: [],
    catalogo: [...catalogo].sort((a, b) => (a.id < b.id ? -1 : 1)), eventi: {}, eventiFatti: {}
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
      tratti: { ...n.tratti }, vivo: true, tregue: {}, obiettivo: null, difficolta: n.difficolta ?? 'normale'
    };
  }
  // i dormienti aspettano un evento: si tengono nello stato per poterli risvegliare
  game.dormienti = {};
  for (const n of popoli.popoli.filter(x => x.dormiente)) {
    game.dormienti[n.id] = { id: n.id, nome: n.nome, colore: n.colore, cultura: n.cultura, governo: n.governo, capitale: n.capitale, tratti: { ...n.tratti }, difficolta: n.difficolta ?? 'normale' };
  }
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    const owned = provincesOf(game, id);
    const bonus = 1 + recruitBonus(game, id), d = difficultyOf(game, id);
    const uomini = sumOf(owned, 'uomini');
    n.tesoro = sumOf(owned, 'tasse') * balance.economia.tasseMese * balance.inizio.tesoroMesi * d.tesoro;
    n.uomini = Math.round(maxManpower(game, id) * balance.inizio.riservaQuota * d.uomini);
    createArmy(game, id, n.capitale,
      Math.round(uomini * balance.inizio.fanteriaPerUomo * bonus * d.esercito),
      Math.round(uomini * balance.inizio.cavalleriaPerUomo * bonus * d.esercito));
  }
  initDiplomacy(game);
  initGovernment(game);
  initCulture(game);
  return game;
}
