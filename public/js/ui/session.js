// Partita del giocatore: gli altri popoli hanno un controller, il giocatore comanda dall'interfaccia.
import { createGame } from '../sim/setup.js';
import { advanceDay, isOver } from '../sim/loop.js';
import { isNewYear } from '../sim/calendar.js';
import { buildControllers } from '../ai/modes.js';
import { formatLogEntry } from './views.js';

export function createSessionFrom(game, giocatore, seme, ia = 'regole', ai = null) {
  return { game, giocatore, seme, ia, ai, controllers: buildControllers(game, ia, ai, giocatore) };
}

export function createSession(data, giocatore, seme, ia = 'regole', ai = null) {
  return createSessionFrom(createGame({ ...data, seed: seme }), giocatore, seme, ia, ai);
}

// Perché il gioco deve fermarsi adesso, se deve.
export function pausaNecessaria(session) {
  const { game, giocatore } = session;
  if (isOver(game)) return 'fine';
  if (!game.nazioni[giocatore].vivo) return 'sconfitta';
  if (Object.values(game.proposte).some(p => p.a === giocatore)) return 'proposta';
  return null;
}

export function runDays(session, days, { onYear } = {}) {
  const notizie = [];
  let giorni = 0;
  let motivo = pausaNecessaria(session);
  while (!motivo && giorni < days) {
    const log = advanceDay(session.game, session.controllers);
    giorni++;
    for (const e of log) {
      const t = formatLogEntry(e, session.game, session.giocatore);
      if (t) notizie.push(t);
    }
    if (onYear && isNewYear(session.game.day)) onYear(session);
    motivo = pausaNecessaria(session);
  }
  return { giorni, motivo, notizie };
}
