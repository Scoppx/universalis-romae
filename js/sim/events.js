// Eventi: condizioni, scatto mensile, scelta ed effetti. Il catalogo sta in game.catalogo (non si salva).
import { log, clamp, provincesOf, bordersNation, maxManpower, newId, sliderOf } from './state.js';
import { nextRandom } from './rng.js';
import { dateFromDay } from './calendar.js';
import { monthlyIncome } from './economy.js';
import { changeRelation } from './diplomacy.js';
import { atWar, startWar } from './war.js';
import { dormantReady, activateDormant } from './dormant.js';

const ALTRO = ['relazione', 'pretesto', 'pretestoAltro', 'guerra'];
const LEVE = { societa: 'società', guerra: 'dottrina', governo: 'province' };
const segno = n => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

export function eventDef(game, id) {
  return game.catalogo.find(e => e.id === id) ?? null;
}

const vivo = (game, id) => Boolean(id && game.nazioni[id]?.vivo && game.ordine.includes(id));

// Il popolo confinante a cui l'evento si riferisce: prima i preferiti, poi (se ammesso) il primo in ordine.
export function resolveOther(game, def, id) {
  const a = def.condizioni.altro;
  if (!a) return null;
  // i confinanti si calcolano una volta: controllarli uno per uno ripercorre tutte le province
  const confinanti = new Set();
  for (const p of provincesOf(game, id)) for (const v of p.vicini) confinanti.add(game.province[v].owner);
  const ok = o => o !== id && vivo(game, o) && confinanti.has(o) && (!a.culture || a.culture.includes(game.nazioni[o].cultura));
  const pref = (a.preferiti ?? []).find(ok);
  if (pref) return pref;
  return a.soloPreferiti ? null : game.ordine.find(ok) ?? null;
}

const inGuerra = (game, id) => Object.values(game.guerre).some(w => w.attaccanti.includes(id) || w.difensori.includes(id));

export function conditionsHold(game, def, id) {
  const c = def.condizioni, n = game.nazioni[id];
  const anno = dateFromDay(game.day).year;
  if (c.anni && (anno > c.anni[0] || anno < c.anni[1])) return false;
  if (c.popoli && !c.popoli.includes(id)) return false;
  if (c.culture && !c.culture.includes(n.cultura)) return false;
  if (c.governi && !c.governi.includes(n.governo)) return false;
  if (c.provincia) {
    const p = game.province[c.provincia];
    if (!p || p.owner !== id || p.controller !== id) return false;
  }
  if (c.minProvince !== undefined || c.maxProvince !== undefined) {
    const np = provincesOf(game, id).length;
    if (c.minProvince !== undefined && np < c.minProvince) return false;
    if (c.maxProvince !== undefined && np > c.maxProvince) return false;
  }
  if (c.stabilitaMin !== undefined && n.stabilita < c.stabilitaMin) return false;
  if (c.stabilitaMax !== undefined && n.stabilita > c.stabilitaMax) return false;
  if (c.guerra !== undefined && c.guerra !== inGuerra(game, id)) return false;
  const fatti = game.eventiFatti[def.id] ?? [];
  const volta = c.unaVolta ?? 'popolo';
  if (volta === 'partita' && fatti.length) return false;
  if (volta === 'popolo' && fatti.includes(id)) return false;
  if (c.altro && !resolveOther(game, def, id)) return false;
  // un risveglio scatta solo per il padrone della capitale del dormiente
  for (const o of def.opzioni) for (const eff of o.effetti) {
    if (eff.crea_popolo && !dormantReady(game, eff.crea_popolo.popolo, id)) return false;
  }
  return true;
}

// Il primo del mese: per ogni popolo senza eventi in attesa, il primo evento del catalogo che scatta.
export function monthlyEvents(game) {
  for (const id of game.ordine) {
    if (!game.nazioni[id].vivo) continue;
    if (Object.values(game.eventi).some(e => e.nazione === id)) continue;
    for (const def of game.catalogo) {
      if (!conditionsHold(game, def, id)) continue;
      if (nextRandom(game) >= def.condizioni.probabilita) continue;
      const pid = newId(game, 'v');
      game.eventi[pid] = { id: pid, evento: def.id, nazione: id, altro: resolveOther(game, def, id), giorno: game.day };
      (game.eventiFatti[def.id] ??= []).push(id);
      log(game, { tipo: 'evento_arrivato', evento: pid, nazione: id });
      break;
    }
  }
}

export function checkChoice(game, id, pid, opzione) {
  const e = game.eventi[pid];
  if (!e || e.nazione !== id) return 'evento inesistente';
  const def = eventDef(game, e.evento);
  if (!def || !def.opzioni.some(o => o.id === opzione)) return 'opzione inesistente';
  return null;
}

function applyEffect(game, e, eff) {
  const [k, v] = Object.entries(eff)[0];
  const id = e.nazione, n = game.nazioni[id];
  const altro = vivo(game, e.altro) && bordersNation(game, id, e.altro) ? e.altro : null;
  if (ALTRO.includes(k) && !altro) return; // l'altro è sparito o non confina più: l'effetto su di lui si salta
  const anniPretesto = game.day + 365 * game.balance.diplomazia.pretestoAnni;
  switch (k) {
    case 'stabilita': n.stabilita = clamp(n.stabilita + v, -3, 3); break;
    case 'tesoroMesi': n.tesoro += v * Math.max(1, monthlyIncome(game, id)); break;
    case 'uominiQuota': {
      const max = maxManpower(game, id);
      n.uomini = clamp(Math.round(n.uomini + v * max), 0, max);
      break;
    }
    case 'infamia': n.infamia = Math.max(0, n.infamia + v); break;
    case 'relazione': changeRelation(game, id, altro, v); break;
    case 'pretesto': n.pretesti[altro] = anniPretesto; break;
    case 'pretestoAltro': game.nazioni[altro].pretesti[id] = anniPretesto; break;
    case 'guerra': if (!atWar(game, altro, id)) startWar(game, altro, id); break;
    case 'cambia_governo':
      n.governo = v;
      log(game, { tipo: 'governo', nazione: id, governo: v });
      break;
    case 'slider': {
      const lim = game.balance.slider.limite;
      n.slider = { ...sliderOf(game, id) };
      for (const [q, d] of Object.entries(v)) n.slider[q] = clamp(n.slider[q] + d, -lim, lim);
      break;
    }
    case 'crea_popolo':
      // risveglio saltato (la capitale è cambiata di mano): l'evento non conta come fatto e potrà tornare
      if (!activateDormant(game, v.popolo, v)) game.eventiFatti[e.evento] = (game.eventiFatti[e.evento] ?? []).filter(x => x !== id);
      break;
    default: break; // il validatore impedisce effetti sconosciuti
  }
}

export function chooseOption(game, id, pid, opzione) {
  const err = checkChoice(game, id, pid, opzione);
  if (err) return { ok: false, motivo: err };
  const e = game.eventi[pid], def = eventDef(game, e.evento);
  delete game.eventi[pid];
  for (const eff of def.opzioni.find(o => o.id === opzione).effetti) applyEffect(game, e, eff);
  log(game, { tipo: 'evento', evento: def.id, nazione: id, opzione, storico: Boolean(def.storico) });
  return { ok: true };
}

// Ogni giorno: eventi orfani scartati; dopo la scadenza sceglie la regola.
export function expireEvents(game) {
  for (const e of Object.values(game.eventi)) {
    const def = eventDef(game, e.evento);
    if (!def || !game.nazioni[e.nazione]?.vivo) { delete game.eventi[e.id]; continue; }
    if (game.day - e.giorno > game.balance.eventi.scadenza) chooseOption(game, e.nazione, e.id, def.regola);
  }
}

// Riassunto leggibile degli effetti di un'opzione, per la finestra del giocatore e per le domande a Jev.
export function describeEffects(game, e, opzione) {
  const altro = game.nazioni[e.altro]?.nome ?? 'il vicino';
  const parti = opzione.effetti.map(eff => {
    const [k, v] = Object.entries(eff)[0];
    switch (k) {
      case 'stabilita': return `stabilità ${segno(v)}`;
      case 'tesoroMesi': return `tesoro ${segno(v)} mesi di entrate`;
      case 'uominiQuota': return `riserva di uomini ${segno(Math.round(v * 100))}%`;
      case 'infamia': return `infamia ${segno(v)}`;
      case 'relazione': return `relazioni con ${altro} ${segno(v)}`;
      case 'pretesto': return `pretesto contro ${altro}`;
      case 'pretestoAltro': return `${altro} ottiene un pretesto contro di noi`;
      case 'guerra': return `${altro} ci dichiara guerra`;
      case 'cambia_governo': return `governo: ${v}`;
      case 'slider': return Object.entries(v).map(([q, d]) => `${LEVE[q]} ${segno(d)}`).join(', ');
      default: return describeExtra(game, k, v); // crea_popolo
    }
  });
  return parti.length ? parti.join(', ') : 'nessun effetto';
}

function describeExtra(game, k, v) {
  if (k !== 'crea_popolo') return k;
  const nome = game.dormienti[v.popolo]?.nome ?? game.nazioni[v.popolo]?.nome ?? v.popolo;
  return `nasce ${nome}${(v.esercito ?? 1) !== 1 ? ` (esercito ×${v.esercito})` : ''}${v.guerra ? ', in guerra con noi' : ''}${v.relazione ? `, relazioni ${segno(v.relazione)}` : ''}`;
}
