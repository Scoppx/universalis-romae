// Partita del giocatore: gli altri popoli hanno un controller, il giocatore comanda dall'interfaccia.
import { createGame } from '../sim/setup.js';
import { advanceDay, isOver } from '../sim/loop.js';
import { isNewYear } from '../sim/calendar.js';
import { rulesController } from '../ai/rules.js';
import { formatLogEntry } from './views.js';

export function controllersFor(game, giocatore) {
  return Object.fromEntries(game.ordine.filter(id => id !== giocatore).map(id => [id, rulesController]));
}

export function createSessionFrom(game, giocatore, seme) {
  return { game, giocatore, seme, controllers: controllersFor(game, giocatore) };
}

export function createSession(data, giocatore, seme) {
  return createSessionFrom(createGame({ ...data, seed: seme }), giocatore, seme);
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
