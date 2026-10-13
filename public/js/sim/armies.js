// Eserciti: reclutamento, percorsi e movimento giornaliero.
import { createArmy, strettoKey } from './state.js';
import { atWar } from './war.js';
import { friendly } from './diplomacy.js';

export function travelDays(game, from, to) {
  const b = game.balance.movimento;
  return b.giorni[game.province[to].terreno] + (game.stretti.includes(strettoKey(from, to)) ? b.stretto : 0);
}

// Si entra in casa propria, dove si controlla, o nelle terre di chi è in guerra con noi.
export function canEnter(game, nationId, provId) {
  const p = game.province[provId];
  return p.owner === nationId || p.controller === nationId || atWar(game, nationId, p.owner) || friendly(game, nationId, p.owner);
}

// Dijkstra sui giorni di viaggio, solo attraverso province in cui si può entrare.
export function distancesFrom(game, nationId, from) {
  const dist = { [from]: 0 }, prev = {}, done = new Set();
  const open = new Set([from]);
  while (open.size) {
    let cur = null;
    for (const id of open) {
      if (cur === null || dist[id] < dist[cur] || (dist[id] === dist[cur] && id < cur)) cur = id;
    }
    open.delete(cur);
    done.add(cur);
    for (const v of game.province[cur].vicini) {
      if (done.has(v) || !canEnter(game, nationId, v)) continue;
      const d = dist[cur] + travelDays(game, cur, v);
      if (dist[v] === undefined || d < dist[v]) { dist[v] = d; prev[v] = cur; open.add(v); }
    }
  }
  return { dist, prev };
}

// Province da attraversare, partenza esclusa; null se non si arriva.
export function findPath(game, nationId, from, to) {
  if (from === to) return [];
  if (!canEnter(game, nationId, to)) return null;
  const { dist, prev } = distancesFrom(game, nationId, from);
  if (dist[to] === undefined) return null;
  const path = [];
  for (let c = to; c !== from; c = prev[c]) path.unshift(c);
  return path;
}

export function orderMove(game, armyId, to) {
  const a = game.eserciti[armyId];
  if (!a) return { ok: false, motivo: 'esercito inesistente' };
  if (!game.province[to]) return { ok: false, motivo: 'provincia inesistente' };
  const path = findPath(game, a.owner, a.prov, to);
  if (path === null) return { ok: false, motivo: 'nessun percorso' };
  a.percorso = path;
  a.giorniAlProssimo = path.length ? travelDays(game, a.prov, path[0]) : 0;
  return { ok: true };
}

export function advanceMovement(game) {
  for (const a of Object.values(game.eserciti)) {
    if (a.inBattaglia || a.percorso.length === 0) continue;
    // la pace può aver chiuso la strada: l'esercito si ferma dov'è
    if (!canEnter(game, a.owner, a.percorso[0])) { a.percorso = []; continue; }
    a.giorniAlProssimo -= 1;
    if (a.giorniAlProssimo > 0) continue;
    a.prov = a.percorso.shift();
    if (a.percorso.length) a.giorniAlProssimo = travelDays(game, a.prov, a.percorso[0]);
  }
}

export function recruit(game, nationId, provId, fanteria, cavalleria) {
  const n = game.nazioni[nationId], p = game.province[provId], c = game.balance.costi;
  if (!n?.vivo) return { ok: false, motivo: 'nazione inesistente' };
  if (!p || p.owner !== nationId || p.controller !== nationId) return { ok: false, motivo: 'provincia non tua' };
  if (!Number.isInteger(fanteria) || !Number.isInteger(cavalleria) || fanteria < 0 || cavalleria < 0 || fanteria + cavalleria === 0) {
    return { ok: false, motivo: 'numeri non validi' };
  }
  const costo = fanteria / 1000 * c.fanteria1000 + cavalleria / 1000 * c.cavalleria1000;
  if (n.tesoro < costo) return { ok: false, motivo: 'denaro insufficiente' };
  if (n.uomini < fanteria + cavalleria) return { ok: false, motivo: 'uomini insufficienti' };
  n.tesoro -= costo;
  n.uomini -= fanteria + cavalleria;
  const here = Object.values(game.eserciti).find(a =>
    a.owner === nationId && a.prov === provId && a.percorso.length === 0 && !a.inBattaglia);
  if (here) {
    here.fanteria += fanteria;
    here.cavalleria += cavalleria;
    return { ok: true, esercito: here.id };
  }
  return { ok: true, esercito: createArmy(game, nationId, provId, fanteria, cavalleria).id };
}

export function mergeArmies(game, nationId, ids) {
  if (!Array.isArray(ids) || ids.length < 2 || new Set(ids).size !== ids.length) return { ok: false, motivo: 'servono almeno due eserciti' };
  const armies = ids.map(id => game.eserciti[id]);
  if (armies.some(a => !a || a.owner !== nationId)) return { ok: false, motivo: 'esercito non tuo' };
  if (armies.some(a => a.prov !== armies[0].prov)) return { ok: false, motivo: 'non sono nella stessa provincia' };
  if (armies.some(a => a.inBattaglia || a.percorso.length)) return { ok: false, motivo: 'eserciti in marcia o in battaglia' };
  const men = a => a.fanteria + a.cavalleria;
  const tot = armies.reduce((s, a) => s + men(a), 0);
  const [first, ...rest] = armies;
  if (tot > 0) first.morale = armies.reduce((s, a) => s + a.morale * men(a), 0) / tot;
  for (const a of rest) {
    first.fanteria += a.fanteria;
    first.cavalleria += a.cavalleria;
    delete game.eserciti[a.id];
  }
  return { ok: true, esercito: first.id };
}

export function splitArmy(game, nationId, id) {
  const a = game.eserciti[id];
  if (!a || a.owner !== nationId) return { ok: false, motivo: 'esercito non tuo' };
  if (a.inBattaglia) return { ok: false, motivo: 'esercito in battaglia' };
  const fanti = Math.floor(a.fanteria / 2), cavalieri = Math.floor(a.cavalleria / 2);
  const min = game.balance.combattimento.minimoUomini;
  if (fanti + cavalieri < min || a.fanteria - fanti + a.cavalleria - cavalieri < min) return { ok: false, motivo: 'esercito troppo piccolo' };
  a.fanteria -= fanti;
  a.cavalleria -= cavalieri;
  const b = createArmy(game, nationId, a.prov, fanti, cavalieri);
  b.morale = a.morale;
  return { ok: true, esercito: b.id };
}
