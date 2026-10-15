// Assedi a giorni contati: ogni provincia assediata accumula punti ogni giorno e a 100 cade.
// I punti al giorno crescono con gli uomini degli assedianti e calano con il presidio (che conta già la fortificazione):
// una provincia con il presidio di riferimento (625, una provincia media senza mura) cade come con il vecchio assedio a caso.
import { log, RIBELLI } from './state.js';
import { nextRandom } from './rng.js';
import { atWar } from './war.js';
import { friendly } from './diplomacy.js';

export function garrison(game, prov) {
  return Math.round(prov.uomini * game.balance.assedio.presidioPerUomo * (1 + prov.fort));
}

export function siegeRate(game, owner, men, prov) {
  const s = game.balance.assedio, t = game.nazioni[owner].tratti;
  return 100 * Math.min(s.massimo, s.base * men / 1000 * s.presidioRiferimento / Math.max(1, garrison(game, prov))) * (1 + (t.assedio || 0));
}

// Probabilità giornaliera equivalente di un esercito da solo (per chi la vuole leggere così).
export function siegeChance(game, army, prov) {
  return siegeRate(game, army.owner, army.fanteria + army.cavalleria, prov) / 100;
}

const uomini = a => a.fanteria + a.cavalleria;

// Eserciti fermi, non in battaglia, in guerra con chi controlla la provincia.
export function besiegers(game, prov, qui = Object.values(game.eserciti).filter(a => a.prov === prov.id)) {
  return qui.filter(a => !a.inBattaglia && !a.percorso.length && a.owner !== prov.controller && atWar(game, a.owner, prov.controller));
}

// L'assedio di una provincia: chi lo guida (il popolo con più uomini), quanti uomini lo sostengono
// (lui e i suoi amici), i punti al giorno. null se nessuno assedia o se ci sono nemici degli assedianti.
// qui: gli eserciti nella provincia, se già raccolti (advanceSieges li raggruppa una volta al giorno).
export function siegeInfo(game, prov, qui = Object.values(game.eserciti).filter(a => a.prov === prov.id)) {
  const ass = besiegers(game, prov, qui);
  if (!ass.length) return null;
  const per = {};
  for (const a of ass) per[a.owner] = (per[a.owner] ?? 0) + uomini(a);
  const ordine = id => (id === RIBELLI ? Infinity : game.ordine.indexOf(id));
  const capo = Object.keys(per).sort((a, b) => per[b] - per[a] || ordine(a) - ordine(b))[0];
  if (qui.some(e => atWar(game, capo, e.owner))) return null;
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
  const per = {};
  for (const a of Object.values(game.eserciti)) (per[a.prov] ??= []).push(a);
  for (const id of Object.keys(game.province).sort()) {
    const p = game.province[id];
    if (!per[id]) { p.assedio = null; continue; }
    const info = siegeInfo(game, p, per[id]);
    if (!info) { p.assedio = null; continue; }
    p.assedio = { nazione: info.capo, punti: info.punti + info.rate };
    if (p.assedio.punti >= 100 - 1e-9) fallProvince(game, p, info.capo);
  }
}

// Gli eserciti fermi di `owner` nella provincia.
function fermiDi(game, owner, prov) {
  return Object.values(game.eserciti).filter(a => a.prov === prov.id && a.owner === owner && !a.percorso.length);
}

// Probabilità di vincere un assalto: uomini / (uomini + presidio × (2 + fortificazione)).
export function assaultChance(game, owner, prov) {
  const men = fermiDi(game, owner, prov).filter(a => !a.inBattaglia).reduce((s, a) => s + uomini(a), 0);
  return men ? men / (men + garrison(game, prov) * (2 + prov.fort)) : 0;
}

export function checkAssault(game, owner, provId) {
  const p = game.province[provId];
  if (!p) return 'provincia inesistente';
  const mine = fermiDi(game, owner, p);
  if (!mine.length) return 'nessun tuo esercito fermo qui';
  if (mine.some(a => a.inBattaglia)) return 'gli eserciti sono in battaglia';
  if (p.controller === owner || !atWar(game, owner, p.controller)) return 'non sei in guerra con chi la tiene';
  if (Object.values(game.eserciti).some(e => e.prov === p.id && atWar(game, owner, e.owner))) return 'ci sono nemici nella provincia';
  return null;
}

// Assalto immediato: un tiro. Vittoria: la provincia cade, si perdono uomini pari a metà del presidio.
// Sconfitta: ogni esercito perde il 20% e il morale; l'assedio continua.
export function assault(game, owner, provId) {
  const err = checkAssault(game, owner, provId);
  if (err) return { ok: false, motivo: err };
  const p = game.province[provId], s = game.balance.assedio, mine = fermiDi(game, owner, p);
  const vinto = nextRandom(game) < assaultChance(game, owner, p);
  const tot = mine.reduce((t, a) => t + uomini(a), 0);
  for (const a of mine) {
    const n = uomini(a);
    if (!n) continue;
    const perdita = vinto ? garrison(game, p) * s.assaltoPerditaVittoria * n / tot : n * s.assaltoPerditaSconfitta;
    a.fanteria -= Math.min(a.fanteria, Math.round(perdita * a.fanteria / n));
    a.cavalleria -= Math.min(a.cavalleria, Math.round(perdita * a.cavalleria / n));
    if (!vinto) a.morale = 0;
    if (uomini(a) < game.balance.combattimento.minimoUomini) delete game.eserciti[a.id];
  }
  log(game, { tipo: 'assalto', prov: provId, nazione: owner, vinto });
  if (vinto) fallProvince(game, p, owner);
  return { ok: true, vinto };
}
