// Controllo del catalogo degli eventi: ogni riferimento esiste, ogni effetto è noto. Restituisce gli errori.
import { SLIDER } from './government.js';

const ID = /^[a-z0-9_]+$/;
const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const isNum = n => typeof n === 'number' && Number.isFinite(n);
const isStr = s => typeof s === 'string' && s.length > 0;
const SUL_ALTRO = ['relazione', 'pretesto', 'pretestoAltro', 'guerra'];

export function validateEvents(catalogo, { map, popoli, balance, ambizioni = null }) {
  const err = [];
  const popoliId = new Set(popoli.popoli.map(p => p.id));
  const dormienti = new Set(popoli.popoli.filter(p => p.dormiente).map(p => p.id));
  const culture = new Set([...popoli.popoli.map(p => p.cultura), ...map.province.map(p => p.cultura)]);
  const governi = new Set(Object.keys(balance.governi));
  const province = new Set(map.province.map(p => p.id));
  const visti = new Set();
  if (!Array.isArray(catalogo)) return ['catalogo non è un elenco'];
  for (const e of catalogo) {
    const E = msg => err.push(`${e?.id ?? '?'}: ${msg}`);
    if (!isObj(e) || !isStr(e.id) || !ID.test(e.id)) { E('id non valido'); continue; }
    if (visti.has(e.id)) E('id ripetuto');
    visti.add(e.id);
    if (!isStr(e.titolo) || !isStr(e.testo)) E('titolo o testo mancante');
    if (e.storico !== undefined && typeof e.storico !== 'boolean') E('storico non booleano');
    const c = e.condizioni;
    if (!isObj(c)) { E('condizioni mancanti'); continue; }
    if (!isNum(c.probabilita) || c.probabilita <= 0 || c.probabilita > 1) E('probabilita fuori da (0, 1]');
    if (c.anni !== undefined && !(Array.isArray(c.anni) && c.anni.length === 2 && c.anni.every(Number.isInteger) &&
      c.anni[0] <= 753 && c.anni[0] >= c.anni[1] && c.anni[1] >= 264)) E('anni non validi (a.C., da >= a)');
    for (const p of c.popoli ?? []) if (!popoliId.has(p)) E(`popolo sconosciuto ${p}`);
    for (const k of c.culture ?? []) if (!culture.has(k)) E(`cultura sconosciuta ${k}`);
    for (const g of c.governi ?? []) if (!governi.has(g)) E(`governo sconosciuto ${g}`);
    if (c.provincia !== undefined && !province.has(c.provincia)) E(`provincia sconosciuta ${c.provincia}`);
    if (c.unaVolta !== undefined && !['partita', 'popolo', false].includes(c.unaVolta)) E('unaVolta non valido');
    for (const k of ['minProvince', 'maxProvince']) if (c[k] !== undefined && !(Number.isInteger(c[k]) && c[k] >= 0)) E(`${k} non valido`);
    for (const k of ['stabilitaMin', 'stabilitaMax']) if (c[k] !== undefined && !(Number.isInteger(c[k]) && Math.abs(c[k]) <= 3)) E(`${k} non valido`);
    if (c.guerra !== undefined && typeof c.guerra !== 'boolean') E('guerra non booleano');
    if (c.altro !== undefined) {
      if (!isObj(c.altro)) E('altro non valido');
      else {
        for (const p of c.altro.preferiti ?? []) if (!popoliId.has(p)) E(`popolo sconosciuto ${p}`);
        for (const k of c.altro.culture ?? []) if (!culture.has(k)) E(`cultura sconosciuta ${k}`);
        if (c.altro.soloPreferiti !== undefined && typeof c.altro.soloPreferiti !== 'boolean') E('soloPreferiti non booleano');
      }
    }
    if (!Array.isArray(e.opzioni) || e.opzioni.length < 1 || e.opzioni.length > 4) { E('opzioni: da 1 a 4'); continue; }
    const opz = new Set();
    for (const o of e.opzioni) {
      if (!isObj(o) || !isStr(o.id) || !ID.test(o.id) || opz.has(o.id)) { E('opzione con id non valido o ripetuto'); continue; }
      opz.add(o.id);
      if (!isStr(o.testo)) E(`opzione ${o.id}: testo mancante`);
      if (!Array.isArray(o.effetti)) { E(`opzione ${o.id}: effetti mancanti`); continue; }
      for (const eff of o.effetti) {
        const chiavi = isObj(eff) ? Object.keys(eff) : [];
        if (chiavi.length !== 1) { E(`opzione ${o.id}: effetto con ${chiavi.length} chiavi`); continue; }
        const [k] = chiavi, v = eff[k];
        if (SUL_ALTRO.includes(k) && !c.altro) E(`opzione ${o.id}: ${k} senza altro nelle condizioni`);
        switch (k) {
          case 'stabilita': if (!Number.isInteger(v)) E(`effetto ${k} non intero`); break;
          case 'tesoroMesi': case 'infamia': case 'relazione': if (!isNum(v)) E(`effetto ${k} non numerico`); break;
          case 'uominiQuota': if (!isNum(v) || Math.abs(v) > 1) E(`effetto ${k} fuori da [−1, 1]`); break;
          case 'pretesto': case 'pretestoAltro': case 'guerra': if (v !== true) E(`effetto ${k} deve essere true`); break;
          case 'cambia_governo': if (!governi.has(v)) E(`effetto: governo sconosciuto ${v}`); break;
          case 'slider':
            if (!isObj(v) || !Object.entries(v).every(([q, d]) => SLIDER.includes(q) && Number.isInteger(d))) E('effetto slider non valido');
            break;
          case 'orda':
            if (!isObj(v) || !dormienti.has(v.popolo) || (ambizioni && !ambizioni.orde?.[v.popolo])) E(`effetto orda: ${v?.popolo} non è un'orda`);
            break;
          case 'crea_popolo':
            if (!isObj(v) || !dormienti.has(v.popolo)) E(`effetto crea_popolo: ${v?.popolo} non è un popolo dormiente`);
            else if ((v.esercito !== undefined && !(isNum(v.esercito) && v.esercito > 0)) ||
              (v.guerra !== undefined && typeof v.guerra !== 'boolean') || (v.relazione !== undefined && !isNum(v.relazione))) E('effetto crea_popolo non valido');
            break;
          default: E(`effetto sconosciuto ${k}`);
        }
      }
    }
    if (!opz.has(e.regola)) E(`regola ${e.regola} non è un'opzione`);
  }
  return err;
}
