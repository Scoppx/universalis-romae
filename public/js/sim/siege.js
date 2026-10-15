// Assedi a giorni contati: ogni provincia assediata accumula punti ogni giorno e a 100 cade.
// I punti al giorno sono 100 × la vecchia probabilità giornaliera, sugli uomini di tutti gli assedianti.
import { log, RIBELLI } from './state.js';
import { atWar } from './war.js';
import { friendly } from './diplomacy.js';

export function garrison(game, prov) {
  return Math.round(prov.uomini * game.balance.assedio.presidioPerUomo * (1 + prov.fort));
}

export function siegeRate(game, owner, men, prov) {
  const s = game.balance.assedio, t = game.nazioni[owner].tratti;
  return 100 * Math.min(s.massimo, s.base * men / 1000 / (prov.fort + 1)) * (1 + (t.assedio || 0));
}

// Probabilità giornaliera equivalente di un esercito da solo (per chi la vuole leggere così).
export function siegeChance(game, army, prov) {
  return siegeRate(game, army.owner, army.fanteria + army.cavalleria, prov) / 100;
}

const uomini = a => a.fanteria + a.cavalleria;

// Eserciti fermi, non in battaglia, in guerra con chi controlla la provincia.
export function besiegers(game, prov) {
  return Object.values(game.eserciti).filter(a => a.prov === prov.id && !a.inBattaglia && !a.percorso.length &&
    a.owner !== prov.controller && atWar(game, a.owner, prov.controller));
}

// L'assedio di una provincia: chi lo guida (il popolo con più uomini), quanti uomini lo sostengono
// (lui e i suoi amici), i punti al giorno. null se nessuno assedia o se ci sono nemici degli assedianti.
export function siegeInfo(game, prov) {
  const ass = besiegers(game, prov);
  if (!ass.length) return null;
  const per = {};
  for (const a of ass) per[a.owner] = (per[a.owner] ?? 0) + uomini(a);
  const ordine = id => (id === RIBELLI ? Infinity : game.ordine.indexOf(id));
  const capo = Object.keys(per).sort((a, b) => per[b] - per[a] || ordine(a) - ordine(b))[0];
  if (Object.values(game.eserciti).some(e => e.prov === prov.id && atWar(game, capo, e.owner))) return null;
  const amici = ass.filter(a => a.owner === capo || (a.owner !== RIBELLI && capo !== RIBELLI && friendly(game, a.owner, capo)));
  const men = amici.reduce((s, a) => s + uomini(a), 0);
  const rate = siegeRate(game, capo, men, prov);
  const punti = prov.assedio?.nazione === capo ? prov.assedio.punti : 0;
  return { capo, uomini: men, rate, punti, giorni: Math.ceil((100 - punti) / rate - 1e-9) };
}

export function daysLeft(game, prov) {
  return siegeInfo(game, prov)?.giorni ?? null;
}

// La provincia cade in mano a `capo` (con le regole sui ribelli e sugli alleati che liberano).
export function fallProvince(game, prov, capo) {
  if (capo === RIBELLI) {
    prov.controller = RIBELLI;
    prov.ribelliDal = game.day;
  } else {
    // chi toglie una provincia ai ribelli la rende al padrone, a meno di essere in guerra con lui
    prov.controller = prov.controller === RIBELLI && !atWar(game, capo, prov.owner) ? prov.owner : capo;
    prov.ribelliDal = null;
  }
  prov.assedio = null;
  log(game, { tipo: 'assedio', prov: prov.id, nazione: capo });
}

export function advanceSieges(game) {
  for (const id of Object.keys(game.province).sort()) {
    const p = game.province[id], info = siegeInfo(game, p);
    if (!info) { p.assedio = null; continue; }
    p.assedio = { nazione: info.capo, punti: info.punti + info.rate };
    if (p.assedio.punti >= 100 - 1e-9) fallProvince(game, p, info.capo);
  }
}
