// Orologio di gioco: trasforma il tempo reale in giorni da simulare.
export const SPEEDS = [1000, 500, 200, 100, 50]; // millisecondi per giorno, velocità 1..5
const MAX_PER_FRAME = 10;

export function createClock() {
  return { velocita: 3, pausa: true, accumulo: 0, ultimo: null };
}

export function setSpeed(clock, v) {
  clock.velocita = Math.max(1, Math.min(5, v));
}

export function setPaused(clock, pausa) {
  clock.pausa = pausa;
  clock.ultimo = null;
  clock.accumulo = 0;
}

export function tick(clock, now) {
  if (clock.pausa) { clock.ultimo = null; return 0; }
  if (clock.ultimo === null) { clock.ultimo = now; return 0; }
  clock.accumulo += now - clock.ultimo;
  clock.ultimo = now;
  const ms = SPEEDS[clock.velocita - 1];
  const n = Math.floor(clock.accumulo / ms);
  clock.accumulo -= n * ms;
  // scheda rimasta inattiva: non si recupera tutto il tempo perso
  if (n > MAX_PER_FRAME) { clock.accumulo = 0; return MAX_PER_FRAME; }
  return n;
}

// Quanto del giorno in corso è già passato: serve a muovere i soldatini senza scatti.
export function frazione(clock) {
  if (clock.pausa) return 0;
  return Math.min(1, clock.accumulo / SPEEDS[clock.velocita - 1]);
}
