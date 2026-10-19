// Aiuto una tantum: genera public/data/ambizioni.json (poi si rivede a mano). Non lo usa il gioco.
// Regioni dei popoli da 4 province in su: le province iniziali allargate per vicinanza fino a 2,5 volte.
import { readFileSync, writeFileSync } from 'node:fs';

const read = n => JSON.parse(readFileSync(new URL(`../public/data/${n}`, import.meta.url)));
const map = read('map.json'), popoli = read('popoli.json').popoli;
const by = Object.fromEntries(map.province.map(p => [p.id, p]));
const di = id => map.province.filter(p => p.owner === id).map(p => p.id).sort();

// Anno storico della perdita d'indipendenza (a.C.); l'ambizione è sopravvivere 25 anni oltre, al più fino al 264.
const STORICO = {
  veio: 396, caere: 353, tarquinia: 281, vulci: 280, volsinii: 264, chiusi: 295, volterra: 298, populonia: 280,
  perugia: 295, arezzo: 283, falisci: 241, volsci: 338, equi: 304, marsi: 304, ernici: 306, aurunci: 314, cuma: 421,
  peucezi: 264, reti: 264, elimi: 264, reggio: 270, sibari: 510, crotone: 277, taranto: 272, locri: 275, gela: 405,
  neapolis: 326, lucani: 264, bruzi: 264, senoni: 283, boi: 264, insubri: 264
};
const NOMI = {
  sanniti: 'il Sud', lega_latina: 'il Lazio', sabini: 'la Sabina', umbri: "l'Umbria", piceni: 'il Piceno',
  opici: 'la Campania', enotri: 'la Lucania', itali: 'il Bruzio', messapi: 'il Salento', dauni: 'la Puglia',
  veneti: 'il Veneto', liguri: 'la Liguria', orobi: 'la Lombardia', felsina: "l'Emilia"
};

function cresci(start, quante) {
  const dentro = new Set(start);
  let bordo = [...start];
  while (dentro.size < quante && bordo.length) {
    const nuovi = [...new Set(bordo.flatMap(id => by[id].vicini))].filter(v => !dentro.has(v)).sort();
    for (const v of nuovi) { if (dentro.size >= quante) break; dentro.add(v); }
    bordo = nuovi;
  }
  return [...dentro].sort();
}

const sicilia = [...di('siculi'), ...di('sicani'), ...di('elimi'), ...di('fenici')].sort();
const sicOcc = [...di('sicani'), ...di('elimi'), ...di('fenici')].sort();
const regioni = {
  italia: { nome: "l'Italia", province: map.province.map(p => p.id).sort() },
  sicilia: { nome: 'la Sicilia', province: sicilia },
  sicilia_occidentale: { nome: 'la Sicilia occidentale', province: sicOcc }
};
const amb = { roma: { tipo: 'regione', regione: 'italia' }, fenici: { tipo: 'regione', regione: 'sicilia_occidentale' },
  sicani: { tipo: 'regione', regione: 'sicilia_occidentale' }, siculi: { tipo: 'regione', regione: 'sicilia' },
  siracusa: { tipo: 'regione', regione: 'sicilia' } };
for (const p of popoli) {
  if (amb[p.id]) continue;
  const mie = di(p.id);
  if (!p.dormiente && mie.length >= 4) {
    regioni[p.id] = { nome: NOMI[p.id], province: cresci(mie, Math.round(2.5 * mie.length)) };
    amb[p.id] = { tipo: 'regione', regione: p.id };
  } else {
    if (STORICO[p.id] === undefined) throw new Error(`anno storico mancante: ${p.id}`);
    amb[p.id] = { tipo: 'sopravvivere', anno: Math.max(264, STORICO[p.id] - 25) };
  }
}
// orde: la capitale del dormiente con i suoi vicini; l'ingresso è fuori regione e vi confina
const orde = {};
for (const [id, ingresso] of [['insubri', 'eporedia'], ['boi', 'mantua'], ['senoni', 'spina']]) {
  const cap = popoli.find(p => p.id === id).capitale;
  regioni[`orda_${id}`] = { nome: `le terre di ${by[cap].nome}`, province: [cap, ...by[cap].vicini].sort() };
  orde[id] = { regione: `orda_${id}`, ingresso };
}
writeFileSync(new URL('../public/data/ambizioni.json', import.meta.url), JSON.stringify({ regioni, popoli: amb, orde }, null, 1) + '\n');
console.log(Object.entries(regioni).map(([k, r]) => `${k}: ${r.province.length}`).join(', '));
