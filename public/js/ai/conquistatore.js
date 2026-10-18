// Giocatore automatico aggressivo, per misurare la sfida: guida un popolo come un giocatore che vuole tutto.
// Attacca appena è un po' più forte, annette appena può, manda ultimatum ogni volta che può, integra i federati.
import { power, provincesOf } from '../sim/state.js';
import { sideOf, enemiesOf, annexable, scoreFor, peaceCost, validTerms } from '../sim/war.js';
import { checkProposal, forzaDifesa, checkIntegrate, federatiOf } from '../sim/diplomacy.js';
import { answerProposals, eventAnswers, routine, legalWarTargets } from './rules.js';

const RAPPORTO = 1.2, OGNI = 30;

export function conquerorController(game, id) {
  const cmds = [...answerProposals(game, id), ...eventAnswers(game, id)];
  if (game.day % OGNI === 0) {
    const guerre = Object.values(game.guerre).filter(w => sideOf(w, id));
    for (const w of guerre) {
      const side = sideOf(w, id);
      if (w[side][0] !== id || Object.values(game.proposte).some(p => p.guerra === w.id && p.da === id)) continue;
      // annessione appena possibile, altrimenti tutte le province occupate che il punteggio e la quota permettono
      const annettibile = enemiesOf(w, side).find(e => provincesOf(game, e).length && !annexable(game, w, id, e));
      if (annettibile) {
        cmds.push({ tipo: 'proponi_pace', nazione: id, guerra: w.id, termini: { ricevente: id, province: provincesOf(game, annettibile).map(p => p.id), annessione: annettibile } });
        continue;
      }
      const s = scoreFor(game, w, id), scelte = [];
      const occupate = Object.values(game.province).filter(p => enemiesOf(w, side).includes(p.owner) && w[side].includes(p.controller))
        .sort((a, b) => b.tasse - a.tasse || (a.id < b.id ? -1 : 1));
      for (const p of occupate) {
        const t = { province: [...scelte, p.id] };
        if (peaceCost(game, w, id, t) <= s && !validTerms(game, w, id, t)) scelte.push(p.id);
      }
      if (scelte.length) cmds.push({ tipo: 'proponi_pace', nazione: id, guerra: w.id, termini: { ricevente: id, province: scelte } });
    }
    for (const f of federatiOf(game, id)) if (!checkIntegrate(game, id, f)) cmds.push({ tipo: 'integra', nazione: id, verso: f });
    if (!guerre.length) {
      // ultimatum a chiunque ceda, verso la provincia più ricca
      for (const o of game.ordine) {
        if (o === id || !game.nazioni[o].vivo || power(game, id) < game.balance.diplomazia.ultimatumRapporto * forzaDifesa(game, o)) continue;
        const prov = Object.values(game.province).filter(p => p.owner === o && !checkProposal(game, id, 'ultimatum', o, { provincia: p.id }))
          .sort((a, b) => b.tasse - a.tasse || (a.id < b.id ? -1 : 1))[0];
        if (prov) cmds.push({ tipo: 'proponi', nazione: id, genere: 'ultimatum', verso: o, provincia: prov.id });
      }
      const bersaglio = legalWarTargets(game, id).filter(c => c.rapporto >= RAPPORTO).sort((a, b) => b.rapporto - a.rapporto)[0];
      if (bersaglio) cmds.push({ tipo: 'dichiara_guerra', nazione: id, contro: bersaglio.id });
    }
  }
  cmds.push(...routine(game, id));
  return cmds;
}
