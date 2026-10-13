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

// Effetti del governo (balance.governi): un governo senza voce non ha effetti.
export function governmentOf(game, id) {
  return game.balance.governi?.[game.nazioni[id].governo] ?? {};
}

export function sliderOf(game, id) {
  return game.nazioni[id].slider ?? { societa: 0, guerra: 0, governo: 0 };
}

// Bonus sulle tasse: governo e patrizi (slider della società negativo).
export function taxBonus(game, id) {
  return (governmentOf(game, id).tasse || 0) + Math.max(0, -sliderOf(game, id).societa) * game.balance.slider.tassePatrizi;
}

// Bonus sulle reclute: tratto, governo e plebe (slider della società positivo).
export function recruitBonus(game, id) {
  return (game.nazioni[id].tratti.reclute || 0) + (governmentOf(game, id).reclute || 0) +
    Math.max(0, sliderOf(game, id).societa) * game.balance.slider.reclutePlebe;
}

export function maxManpower(game, nationId) {
  return Math.round(sumOf(provincesOf(game, nationId), 'uomini') * game.balance.economia.uominiMax * (1 + recruitBonus(game, nationId)));
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
