// Helper di lettura e scrittura dello stato, condivisi da tutti i moduli della simulazione.

export function newId(game, prefix) {
  return `${prefix}${game.nextId++}`;
}

export function strettoKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

export function provincesOf(game, nationId) {
  return Object.values(game.province).filter(p => p.owner === nationId);
}

export function sumOf(list, field) {
  return list.reduce((s, x) => s + x[field], 0);
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function maxManpower(game, nationId) {
  const n = game.nazioni[nationId];
  return Math.round(sumOf(provincesOf(game, nationId), 'uomini') * game.balance.economia.uominiMax * (1 + (n.tratti.reclute || 0)));
}

export function armiesOf(game, nationId) {
  return Object.values(game.eserciti).filter(a => a.owner === nationId);
}

export function createArmy(game, owner, prov, fanteria, cavalleria) {
  const id = newId(game, 'e');
  game.eserciti[id] = {
    id, owner, prov, fanteria, cavalleria,
    morale: game.balance.combattimento.moraleMax,
    percorso: [], giorniAlProssimo: 0, inBattaglia: false
  };
  return game.eserciti[id];
}

// Forza in battaglia: la cavalleria vale di più in pianura.
export function armyStrength(game, army) {
  const t = game.province[army.prov].terreno;
  return army.fanteria + army.cavalleria * game.balance.combattimento.cavalleria[t];
}

export function bordersNation(game, a, b) {
  return provincesOf(game, a).some(p => p.vicini.some(v => game.province[v].owner === b));
}

export function log(game, entry) {
  game.log.push({ day: game.day, ...entry });
}

// Forza in uomini: quelli negli eserciti più metà della riserva.
export function power(game, id) {
  const men = armiesOf(game, id).reduce((s, a) => s + a.fanteria + a.cavalleria, 0);
  return men + game.nazioni[id].uomini * 0.5;
}
