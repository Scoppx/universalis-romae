// Unico ingresso delle decisioni nella simulazione: giocatore, regole e Jev passano da qui.
import { declareWar, proposePeace, answerProposal } from './war.js';
import { orderMove, recruit, mergeArmies, splitArmy, rallyArmies, disbandArmies } from './armies.js';
import { raiseStability } from './economy.js';
import { embassy, propose, breakAlliance, leaveFoedus } from './diplomacy.js';
import { moveSlider } from './government.js';
import { foundColony, fortify } from './culture.js';
import { chooseOption } from './events.js';
import { assault } from './siege.js';

export function applyCommand(game, cmd) {
  switch (cmd.tipo) {
    case 'dichiara_guerra':
      return declareWar(game, cmd.nazione, cmd.contro);
    case 'muovi': {
      const a = game.eserciti[cmd.esercito];
      if (!a || a.owner !== cmd.nazione) return { ok: false, motivo: 'esercito non tuo' };
      const r = orderMove(game, cmd.esercito, cmd.verso);
      if (r.ok) a.unisciCon = null; // un ordine nuovo annulla il riunirsi
      return r;
    }
    case 'recluta':
      return recruit(game, cmd.nazione, cmd.provincia, cmd.fanteria, cmd.cavalleria);
    case 'alza_stabilita':
      return raiseStability(game, cmd.nazione);
    case 'proponi_pace':
      return proposePeace(game, cmd.nazione, cmd.guerra, cmd.termini);
    case 'rispondi':
      return answerProposal(game, cmd.nazione, cmd.proposta, cmd.accetta);
    case 'proponi':
      return propose(game, cmd.nazione, cmd.genere, cmd.verso, { provincia: cmd.provincia });
    case 'slider':
      return moveSlider(game, cmd.nazione, cmd.quale, cmd.verso);
    case 'colonia':
      return foundColony(game, cmd.nazione, cmd.provincia);
    case 'fortifica':
      return fortify(game, cmd.nazione, cmd.provincia);
    case 'scegli':
      return chooseOption(game, cmd.nazione, cmd.evento, cmd.opzione);
    case 'esci_foedus':
      return leaveFoedus(game, cmd.nazione);
    case 'rompi_alleanza':
      return breakAlliance(game, cmd.nazione, cmd.con);
    case 'ambasceria':
      return embassy(game, cmd.nazione, cmd.verso);
    case 'unisci':
      return mergeArmies(game, cmd.nazione, cmd.eserciti);
    case 'assalto':
      return assault(game, cmd.nazione, cmd.provincia);
    case 'sciogli':
      return disbandArmies(game, cmd.nazione, cmd.eserciti);
    case 'riunisci':
      return rallyArmies(game, cmd.nazione, cmd.eserciti);
    case 'dividi':
      return splitArmy(game, cmd.nazione, cmd.esercito);
    case 'obiettivo': {
      const n = game.nazioni[cmd.nazione];
      if (!n?.vivo) return { ok: false, motivo: 'nazione inesistente' };
      if (cmd.provincia !== null && !game.province[cmd.provincia]) return { ok: false, motivo: 'provincia inesistente' };
      n.obiettivo = cmd.provincia;
      return { ok: true };
    }
    default:
      return { ok: false, motivo: `comando sconosciuto: ${cmd.tipo}` };
  }
}
