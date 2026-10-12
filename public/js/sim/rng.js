// Generatore mulberry32. Lo stato è un intero a 32 bit salvato in game.rng,
// così una partita salvata riprende con la stessa sequenza.
export function nextRandom(game) {
  let t = (game.rng = (game.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rollD10(game) {
  return Math.floor(nextRandom(game) * 10);
}
