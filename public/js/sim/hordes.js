// Orde galliche: popoli senza province che arrivano con eserciti numerosi, saccheggiano le province che prendono
// e, quando ne tengono abbastanza nella loro regione, si stabiliscono lì e diventano un popolo normale.
import { createArmy, log, isHorde } from './state.js';
import { initDiplomacy } from './diplomacy.js';
import { initGovernment } from './government.js';
import { initAmbitions } from './ambitions.js';
import { checkSurvival } from './war.js';

export { isHorde };

export function activateHorde(game, popolo) {
  const d = game.dormienti?.[popolo], conf = game.ambizioni?.orde?.[popolo];
  if (!d || !conf) return null;
  delete game.dormienti[popolo];
  game.nazioni[popolo] = {
    id: popolo, nome: d.nome, colore: d.colore, cultura: d.cultura, governo: d.governo, capitale: d.capitale,
    tesoro: 0, uomini: 0, stabilita: 0, infamia: 0, tratti: { ...d.tratti }, vivo: true, tregue: {}, obiettivo: null,
    difficolta: d.difficolta ?? 'normale', orda: { regione: conf.regione, prima: null }
  };
  game.ordine.push(popolo);
  initDiplomacy(game);
  initGovernment(game);
  initAmbitions(game);
  const o = game.balance.orde;
  for (let i = 0; i < o.eserciti; i++) createArmy(game, popolo, conf.ingresso, o.fanteria, o.cavalleria);
  log(game, { tipo: 'orda', nazione: popolo, prov: conf.ingresso });
  return popolo;
}

// Una provincia appena presa dall'orda: saccheggio, prima presa nella regione, e forse l'insediamento.
export function hordeTook(game, id, prov) {
  const n = game.nazioni[id];
  n.tesoro += prov.tasse * game.balance.economia.tasseMese * game.balance.orde.saccheggio;
  const regione = game.ambizioni.regioni[n.orda.regione].province;
  if (regione.includes(prov.id) && n.orda.prima === null) n.orda.prima = prov.id;
  checkSettle(game, id);
}

export function checkSettle(game, id) {
  const n = game.nazioni[id];
  if (!n?.orda) return;
  const prese = game.ambizioni.regioni[n.orda.regione].province.map(p => game.province[p]).filter(p => p.controller === id);
  if (prese.length < game.balance.orde.insediamento) return;
  for (const p of prese) {
    p.owner = id;
    p.assimilazione = 0;
    p.assimilazioneDi = id;
    p.colonia = null;
    p.ribelliDal = null;
  }
  n.capitale = n.orda.prima ?? prese[0].id;
  n.orda = null;
  log(game, { tipo: 'insediamento', nazione: id, prov: n.capitale });
  checkSurvival(game); // chi ha perso le sue ultime province sparisce
}
