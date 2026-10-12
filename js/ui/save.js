// Salvataggi: file JSON esportabili e salvataggio automatico nel browser.
import { END_DAY } from '../sim/calendar.js';
import { createSessionFrom } from './session.js';

export const SAVE_VERSION = 1;
export const AUTOSAVE_KEY = 'universalis-romae:autosave';

// Il bilanciamento non si salva: al caricamento vale quello corrente.
export function serialize(session) {
  const { balance, ...game } = session.game;
  return JSON.stringify({ versione: SAVE_VERSION, giocatore: session.giocatore, seme: session.seme, game });
}

export function deserialize(text, data) {
  let s;
  try { s = JSON.parse(text); } catch { return { ok: false, motivo: 'file non valido: non è un salvataggio' }; }
  if (!s || s.versione !== SAVE_VERSION || typeof s.game !== 'object' || !s.game) {
    return { ok: false, motivo: 'file non valido: non è un salvataggio di Universalis Romae (o è di un\'altra versione)' };
  }
  const g = s.game;
  const ids = data.map.province.map(p => p.id);
  if (typeof g.province !== 'object' || !g.province || Object.keys(g.province).length !== ids.length || ids.some(id => !g.province[id])) {
    return { ok: false, motivo: 'salvataggio non valido: la mappa è diversa' };
  }
  if (!Number.isInteger(g.day) || g.day < 0 || g.day > END_DAY) return { ok: false, motivo: 'salvataggio non valido: data impossibile' };
  if (!Array.isArray(g.ordine) || typeof g.nazioni !== 'object' || !g.nazioni?.[s.giocatore]) {
    return { ok: false, motivo: 'salvataggio non valido: popolo del giocatore sconosciuto' };
  }
  for (const k of ['eserciti', 'guerre', 'proposte']) {
    if (typeof g[k] !== 'object' || g[k] === null) return { ok: false, motivo: 'salvataggio non valido: dati mancanti' };
  }
  return { ok: true, session: createSessionFrom({ ...g, balance: data.balance }, s.giocatore, s.seme) };
}

export function writeStorage(storage, key, text) {
  try { storage.setItem(key, text); return true; } catch { return false; }
}

export function readStorage(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}
