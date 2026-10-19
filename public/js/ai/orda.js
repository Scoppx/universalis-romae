// L'IA delle orde (sempre a regole): ogni esercito marcia verso la provincia più vicina della regione che l'orda non
// controlla ancora, dichiara guerra solo al padrone del primo tratto in cui non può entrare, e assedia nella regione.
import { armiesOf } from '../sim/state.js';
import { atWar, checkWar } from '../sim/war.js';
import { canEnter } from '../sim/armies.js';
import { assaultChance, checkAssault } from '../sim/siege.js';
import { mergeIdle, hashId } from './rules.js';

// Percorso (partenza esclusa) verso la prima provincia che soddisfa `meta`, sui vicini senza vincoli d'accesso.
function cammino(game, from, meta) {
  const prev = { [from]: null };
  let bordo = [from];
  while (bordo.length) {
    const prossimo = [];
    for (const c of bordo) {
      for (const v of [...game.province[c].vicini].sort()) {
        if (v in prev) continue;
        prev[v] = c;
        if (meta(v)) {
          const path = [];
          for (let x = v; x !== from; x = prev[x]) path.unshift(x);
          return path;
        }
        prossimo.push(v);
      }
    }
    bordo = prossimo;
  }
  return null;
}

export function hordeOrders(game, id) {
  const n = game.nazioni[id];
  if (!n?.orda || (game.day + hashId(id)) % 7 !== 0) return [];
  const regione = game.ambizioni.regioni[n.orda.regione].province;
  const cmds = mergeIdle(game, id);
  const assorbiti = new Set(cmds.flatMap(u => u.eserciti.slice(1)));
  const dichiarati = new Set(), soglia = game.balance.ia.assaltoSoglia;
  const assalta = p => {
    if (!checkAssault(game, id, p.id) && assaultChance(game, id, p) >= soglia && !cmds.some(c => c.tipo === 'assalto' && c.provincia === p.id)) {
      cmds.push({ tipo: 'assalto', nazione: id, provincia: p.id });
    }
  };
  for (const a of armiesOf(game, id)) {
    if (assorbiti.has(a.id) || a.inBattaglia || a.percorso.length) continue;
    const qui = game.province[a.prov];
    const assediando = qui.controller !== id && atWar(game, id, qui.controller);
    if (assediando && regione.includes(qui.id)) { assalta(qui); continue; }
    const percorso = cammino(game, a.prov, p => regione.includes(p) && game.province[p].controller !== id) ?? [];
    let ultimo = a.prov;
    for (const p of percorso) {
      const o = game.province[p].owner;
      if (canEnter(game, id, p) || dichiarati.has(o)) { ultimo = p; continue; }
      // una guerra nuova per volta, al primo padrone che sbarra la strada
      if (!dichiarati.size && !checkWar(game, id, o)) {
        cmds.push({ tipo: 'dichiara_guerra', nazione: id, contro: o });
        dichiarati.add(o);
        ultimo = p;
        continue;
      }
      break;
    }
    if (ultimo !== a.prov) cmds.push({ tipo: 'muovi', nazione: id, esercito: a.id, verso: ultimo });
    else if (assediando) assalta(qui);
  }
  return cmds;
}
