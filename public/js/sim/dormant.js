// Popoli dormienti: si risvegliano con un evento e prendono la loro provincia capitale dal padrone.
import { provincesOf, maxManpower, recruitBonus, createArmy, log, difficultyOf } from './state.js';
import { initDiplomacy, changeRelation } from './diplomacy.js';
import { initGovernment } from './government.js';
import { checkSurvival, sendStrandedHome, startWar } from './war.js';

// Il risveglio è possibile se la capitale del dormiente è di `id`, controllata da lui, e non è la sua ultima provincia.
export function dormantReady(game, popolo, id) {
  const d = game.dormienti[popolo];
  if (!d) return false;
  const p = game.province[d.capitale];
  return p.owner === id && p.controller === id && provincesOf(game, id).length > 1;
}

export function activateDormant(game, popolo, { esercito = 1, guerra = false, relazione = 0 } = {}) {
  const d = game.dormienti[popolo];
  if (!d) return null;
  const p = game.province[d.capitale], vecchio = p.owner, b = game.balance;
  if (!dormantReady(game, popolo, vecchio)) return null; // la capitale è cambiata di mano: niente risveglio
  delete game.dormienti[popolo];
  game.nazioni[popolo] = {
    id: popolo, nome: d.nome, colore: d.colore, cultura: d.cultura, governo: d.governo, capitale: p.id,
    tesoro: p.tasse * b.economia.tasseMese * b.inizio.tesoroMesi, uomini: 0, stabilita: 0, infamia: 0,
    tratti: { ...d.tratti }, vivo: true, tregue: {}, obiettivo: null, difficolta: d.difficolta ?? 'normale'
  };
  game.ordine.push(popolo);
  initDiplomacy(game);
  initGovernment(game);
  p.owner = popolo;
  p.controller = popolo;
  p.assimilazione = 0;
  p.assimilazioneDi = popolo;
  p.colonia = null;
  p.ribelliDal = null;
  const n = game.nazioni[popolo], bonus = 1 + recruitBonus(game, popolo);
  const diff = difficultyOf(game, popolo);
  n.tesoro *= diff.tesoro;
  n.uomini = Math.round(maxManpower(game, popolo) * b.inizio.riservaQuota * diff.uomini);
  createArmy(game, popolo, p.id,
    Math.round(p.uomini * b.inizio.fanteriaPerUomo * bonus * esercito * diff.esercito),
    Math.round(p.uomini * b.inizio.cavalleriaPerUomo * bonus * esercito * diff.esercito));
  log(game, { tipo: 'nascita', nazione: popolo, prov: p.id, da: vecchio });
  if (relazione) changeRelation(game, popolo, vecchio, relazione);
  checkSurvival(game);
  if (guerra) startWar(game, popolo, vecchio);
  sendStrandedHome(game);
  return popolo;
}
