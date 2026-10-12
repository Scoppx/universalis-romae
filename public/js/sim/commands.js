// Unico ingresso delle decisioni nella simulazione: giocatore, regole e Jev passano da qui.
import { declareWar, proposePeace, answerProposal } from './war.js';
import { orderMove, recruit } from './armies.js';
import { raiseStability } from './economy.js';

export function applyCommand(game, cmd) {
  switch (cmd.tipo) {
    case 'dichiara_guerra':
      return declareWar(game, cmd.nazione, cmd.contro);
    case 'muovi': {
      const a = game.eserciti[cmd.esercito];
      if (!a || a.owner !== cmd.nazione) return { ok: false, motivo: 'esercito non tuo' };
      return orderMove(game, cmd.esercito, cmd.verso);
    }
    case 'recluta':
      return recruit(game, cmd.nazione, cmd.provincia, cmd.fanteria, cmd.cavalleria);
    case 'alza_stabilita':
      return raiseStability(game, cmd.nazione);
    case 'proponi_pace':
      return proposePeace(game, cmd.nazione, cmd.guerra, cmd.termini);
    case 'rispondi':
      return answerProposal(game, cmd.nazione, cmd.proposta, cmd.accetta);
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
