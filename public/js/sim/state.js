// Helper di lettura e scrittura dello stato, condivisi da tutti i moduli della simulazione.

export const RIBELLI = 'ribelli'; // popolo speciale: in guerra con tutti, fuori da game.ordine

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

// Bonus sulle tasse: governo, patrizi (slider della società negativo) e difficoltà.
export function taxBonus(game, id) {
  return (governmentOf(game, id).tasse || 0) + Math.max(0, -sliderOf(game, id).societa) * game.balance.slider.tassePatrizi +
    difficultyOf(game, id).tasse;
}

// Bonus sulle reclute: tratto, governo, plebe (slider della società positivo) e difficoltà.
export function recruitBonus(game, id) {
  return (game.nazioni[id].tratti.reclute || 0) + (governmentOf(game, id).reclute || 0) +
    Math.max(0, sliderOf(game, id).societa) * game.balance.slider.reclutePlebe + difficultyOf(game, id).reclute;
}

// Bonus della difficoltà del popolo (balance.difficolta): normale e valori mancanti sono neutri.
// esercito, tesoro, uomini moltiplicano i valori iniziali; dado, reclute e tasse valgono per tutta la partita;
// capitaleSalva: la capitale non si cede né in pace né con un ultimatum.
export function difficultyOf(game, id) {
  const d = game.balance.difficolta?.[game.nazioni[id]?.difficolta] ?? {};
  // livello di sfida del giocatore: tasse e reclute in più per i popoli dell'IA (senza giocatore, come nel bench, niente)
  const s = game.giocatore && id !== game.giocatore ? game.balance.sfida?.[game.sfida] ?? {} : {};
  return { esercito: d.esercito ?? 1, tesoro: d.tesoro ?? 1, uomini: d.uomini ?? 1, dado: d.dado ?? 0,
    reclute: (d.reclute ?? 0) + (s.reclute ?? 0), tasse: (d.tasse ?? 0) + (s.tasse ?? 0), capitaleSalva: Boolean(d.capitaleSalva) };
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

// I popoli che confinano con `id` (compreso chi possiede una provincia accanto); una sola passata sulle province.
export function neighborsOf(game, id) {
  const out = new Set();
  for (const p of provincesOf(game, id)) for (const v of p.vicini) out.add(game.province[v].owner);
  out.delete(id);
  return out;
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
