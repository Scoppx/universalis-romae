# Tappa 5: eventi e popoli dormienti — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eventi con condizioni, scelte ed effetti (generici, di governo, storici) e risveglio dei 13 popoli dormienti, giocabili dal giocatore in una finestra, scelti da regole e Jev per i popoli IA.

**Architecture:** Il catalogo (`public/data/eventi/*.json`) entra nella partita come `game.catalogo` (dato statico, non salvato, come `balance`). `sim/events.js` valuta le condizioni il primo del mese, crea eventi in attesa in `game.eventi`, applica gli effetti quando arriva il comando `scegli` o allo scadere dei 60 giorni. `sim/dormant.js` tiene i popoli dormienti in `game.dormienti` e li risveglia con l'effetto `crea_popolo`. Un validatore puro (`sim/validate-events.js`) controlla il catalogo nei test, da riga di comando e all'avvio del browser.

**Tech Stack:** Node 24 ES modules, Canvas 2D, `node --test`, playwright-core. Nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-10-12-universalis-romae-design.md`, sezione 13 (e sezione 3, "Eventi").

## Global Constraints

- Simulazione deterministica: numeri casuali solo da `game.rng`; eventi valutati in ordine di id del catalogo, popoli in `game.ordine`.
- La scelta di Jev sugli eventi NON usa `game.rng`: `sampleChoice` (temperatura 0,8) con chiave `seq * 100003 + giorno`.
- Comandi solo da `applyCommand`; un controller comanda solo per sé.
- Stato JSON puro; `game.catalogo` e `game.balance` non si salvano.
- Anni degli eventi in a.C.: `anni: [da, a]` con `753 >= da >= a >= 264`.
- `TYPESAFE_API_KEY` solo lato server; i revisori non chiamano TypeSafe.
- Testi in italiano, commenti in italiano.

## Review Focus

1. **Evento del giocatore mentre il gioco corre**: la sessione si ferma, la finestra mostra l'evento; scelto, se ce n'è un altro (o una proposta) la finestra successiva appare subito.
2. **Effetti con un "altro" morto o non più confinante** tra lo scatto e la scelta: nessun crash, l'effetto su di lui si salta.
3. **Popolo dormiente la cui capitale ha cambiato padrone** dopo lo scatto dell'evento: il risveglio prende comunque la provincia dal padrone attuale, senza eliminare chi la perde se era l'ultima (l'effetto si salta).
4. **Salvataggio con un evento in attesa e un catalogo cambiato** (evento tolto): si carica, l'evento orfano si scarta senza crash.
5. **Rigioco Jev** con domande sugli eventi: identico.

Ogni voce ha il suo test nel task che possiede il codice (Task 6: 1; Task 1: 2; Task 2: 3; Task 5: 4; Task 4: 5).

---

### Task 1: Motore degli eventi

**Files:**
- Create: `public/js/sim/events.js`, `test/events.test.js`
- Modify: `public/data/balance.json` (`"eventi": { "scadenza": 60 }`), `public/js/sim/setup.js`, `public/js/sim/loop.js`, `public/js/sim/commands.js`, `public/js/sim/war.js` (`startWar`), `test/fixtures.js`

**Interfaces:**
- Produces: `startWar(game, a, b)` (war.js: dichiara guerra dando prima ad `a` un pretesto, quindi senza perdita di stabilità); `eventDef(game, id)`, `resolveOther(game, def, id) → id|null`, `conditionsHold(game, def, id) → bool`, `monthlyEvents(game)`, `checkChoice(game, id, pid, opzione) → string|null`, `chooseOption(game, id, pid, opzione) → {ok, motivo?}`, `expireEvents(game)`, `describeEffects(game, pending, opzione) → string` (events.js); `createGame({ ..., catalogo = [] })`; stato `game.catalogo` (array ordinato per id), `game.eventi` (`{ [pid]: { id, evento, nazione, altro, giorno } }`), `game.eventiFatti` (`{ [eventoId]: [nazione] }`); comando `{ tipo: 'scegli', nazione, evento: pid, opzione }`; voci di log `evento_arrivato {evento, nazione}`, `evento {evento, nazione, opzione, storico}`, `governo {nazione, governo}`; `makeGame(seed = 1, catalogo = [])` nei test.

- [ ] **Step 1: fixture** — `makeGame(seed = 1, catalogo = [])` passa `catalogo` a `createGame`.

- [ ] **Step 2: test che falliscono** — `test/events.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { conditionsHold, resolveOther, monthlyEvents, chooseOption, expireEvents, describeEffects, eventDef } from '../public/js/sim/events.js';
import { monthlyIncome } from '../public/js/sim/economy.js';
import { maxManpower } from '../public/js/sim/state.js';
import { atWar, declareWar, hasPretext } from '../public/js/sim/war.js';
import { relation } from '../public/js/sim/diplomacy.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { advanceDay } from '../public/js/sim/loop.js';

const ev = (id, condizioni, opzioni, extra = {}) => ({ id, titolo: id.toUpperCase(), testo: `Testo di ${id}.`, condizioni, opzioni, regola: opzioni[0].id, ...extra });
const opt = (id, effetti) => ({ id, testo: `Opzione ${id}`, effetti });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('condizioni: anni, popoli, culture, governi, provincia, stabilità, guerra, numero di province', () => {
  const g = makeGame();
  const D = c => ev('x', { probabilita: 1, ...c }, [opt('a', [])]);
  assert.equal(conditionsHold(g, D({}), 'roma'), true);
  assert.equal(conditionsHold(g, D({ anni: [753, 700] }), 'roma'), true);
  assert.equal(conditionsHold(g, D({ anni: [600, 500] }), 'roma'), false);
  assert.equal(conditionsHold(g, D({ popoli: ['latini'] }), 'roma'), false);
  assert.equal(conditionsHold(g, D({ culture: ['latina'] }), 'roma'), true);
  assert.equal(conditionsHold(g, D({ governi: ['monarchia'] }), 'roma'), false);
  assert.equal(conditionsHold(g, D({ provincia: 'b' }), 'roma'), true);
  assert.equal(conditionsHold(g, D({ provincia: 'c' }), 'roma'), false);
  assert.equal(conditionsHold(g, D({ minProvince: 3 }), 'roma'), false);
  assert.equal(conditionsHold(g, D({ maxProvince: 2 }), 'roma'), true);
  assert.equal(conditionsHold(g, D({ stabilitaMax: -1 }), 'roma'), false);
  assert.equal(conditionsHold(g, D({ guerra: true }), 'roma'), false);
  declareWar(g, 'roma', 'volsci');
  assert.equal(conditionsHold(g, D({ guerra: true }), 'roma'), true);
  assert.equal(conditionsHold(g, D({ stabilitaMax: -1 }), 'roma'), true); // senza pretesto: −2
});

test('l\'altro: un confinante vivo, prima i preferiti; solo i preferiti se richiesto', () => {
  const g = makeGame();
  assert.equal(resolveOther(g, ev('x', { probabilita: 1, altro: {} }, [opt('a', [])]), 'roma'), 'latini');
  assert.equal(resolveOther(g, ev('x', { probabilita: 1, altro: { preferiti: ['siculi', 'volsci'] } }, [opt('a', [])]), 'roma'), 'volsci');
  assert.equal(resolveOther(g, ev('x', { probabilita: 1, altro: { culture: ['volsca'] } }, [opt('a', [])]), 'roma'), 'volsci');
  const solo = ev('x', { probabilita: 1, altro: { preferiti: ['siculi'], soloPreferiti: true } }, [opt('a', [])]);
  assert.equal(resolveOther(g, solo, 'roma'), null);
  assert.equal(conditionsHold(g, solo, 'roma'), false);
});

test('una volta per popolo, una volta per partita, ripetibile', () => {
  const g = makeGame(1, [
    ev('a_popolo', { probabilita: 1 }, [opt('a', [])]),
    ev('b_partita', { probabilita: 1, unaVolta: 'partita' }, [opt('a', [])]),
    ev('c_sempre', { probabilita: 1, unaVolta: false }, [opt('a', [])])
  ]);
  g.eventiFatti = { a_popolo: ['roma'], b_partita: ['latini'] };
  assert.equal(conditionsHold(g, eventDef(g, 'a_popolo'), 'roma'), false);
  assert.equal(conditionsHold(g, eventDef(g, 'a_popolo'), 'latini'), true);
  assert.equal(conditionsHold(g, eventDef(g, 'b_partita'), 'roma'), false);
  g.eventiFatti.c_sempre = ['roma'];
  assert.equal(conditionsHold(g, eventDef(g, 'c_sempre'), 'roma'), true);
});

test('ogni mese al più un evento nuovo per popolo, che resta in attesa', () => {
  const g = makeGame(1, [ev('a', { probabilita: 1, unaVolta: false }, [opt('x', [])]), ev('b', { probabilita: 1 }, [opt('x', [])])]);
  monthlyEvents(g);
  const attesa = Object.values(g.eventi);
  assert.equal(attesa.length, 4); // un evento per ognuno dei 4 popoli
  assert.ok(attesa.every(e => e.evento === 'a' && e.giorno === 0));
  assert.deepEqual(g.eventiFatti.a, ['roma', 'latini', 'volsci', 'siculi']);
  monthlyEvents(g); // tutti hanno già un evento in attesa
  assert.equal(Object.values(g.eventi).length, 4);
  const h = makeGame(1, [ev('a', { probabilita: 0.0000001 }, [opt('x', [])])]);
  monthlyEvents(h);
  assert.equal(Object.values(h.eventi).length, 0);
});

test('effetti: stabilità, tesoro in mesi, uomini, infamia, governo, slider', () => {
  const g = makeGame(1, [ev('e', { probabilita: 1, popoli: ['roma'] }, [opt('tutto', [
    { stabilita: 5 }, { tesoroMesi: -2 }, { uominiQuota: 0.25 }, { infamia: 3 }, { cambia_governo: 'repubblica' }, { slider: { societa: 2, guerra: -9 } }
  ])])]);
  const n = g.nazioni.roma, t0 = n.tesoro, u0 = n.uomini, entrate = monthlyIncome(g, 'roma');
  monthlyEvents(g);
  const pid = Object.keys(g.eventi)[0];
  assert.deepEqual(applyCommand(g, { tipo: 'scegli', nazione: 'roma', evento: pid, opzione: 'tutto' }), { ok: true });
  assert.equal(n.stabilita, 3);
  close(n.tesoro, t0 - 2 * Math.max(1, entrate));
  assert.equal(n.uomini, Math.min(maxManpower(g, 'roma'), Math.round(u0 + 0.25 * maxManpower(g, 'roma'))));
  assert.equal(n.infamia, 3);
  assert.equal(n.governo, 'repubblica');
  assert.deepEqual(n.slider, { societa: 2, guerra: -5, governo: 0 });
  assert.equal(n.ultimoSlider, null); // l'evento non consuma la riforma
  assert.equal(g.eventi[pid], undefined);
  assert.ok(g.log.some(e => e.tipo === 'evento' && e.evento === 'e' && e.opzione === 'tutto'));
  assert.ok(g.log.some(e => e.tipo === 'governo' && e.governo === 'repubblica'));
});

test('effetti sull\'altro: relazione, pretesti, guerra senza perdere stabilità', () => {
  const g = makeGame(1, [ev('e', { probabilita: 1, popoli: ['roma'], altro: { preferiti: ['volsci'] } }, [opt('x', [
    { relazione: -40 }, { pretesto: true }, { pretestoAltro: true }, { guerra: true }
  ])])]);
  monthlyEvents(g);
  const pid = Object.keys(g.eventi)[0];
  assert.equal(g.eventi[pid].altro, 'volsci');
  chooseOption(g, 'roma', pid, 'x');
  assert.equal(relation(g, 'roma', 'volsci'), -40 - 100); // −40 dall'evento, −100 dalla guerra
  assert.equal(hasPretext(g, 'roma', 'volsci'), true);
  assert.equal(atWar(g, 'volsci', 'roma'), true);
  assert.equal(g.nazioni.volsci.stabilita, 0);
});

test('un altro morto nel frattempo: gli effetti su di lui si saltano', () => {
  const g = makeGame(1, [ev('e', { probabilita: 1, popoli: ['roma'], altro: { preferiti: ['volsci'] } }, [opt('x', [{ relazione: -40 }, { guerra: true }, { stabilita: 1 }])])]);
  monthlyEvents(g);
  const pid = Object.keys(g.eventi)[0];
  g.nazioni.volsci.vivo = false;
  assert.deepEqual(chooseOption(g, 'roma', pid, 'x'), { ok: true });
  assert.equal(g.nazioni.roma.stabilita, 1);
  assert.equal(atWar(g, 'volsci', 'roma'), false);
});

test('scelte non valide e scadenza: dopo 60 giorni decide la regola', () => {
  const g = makeGame(1, [ev('e', { probabilita: 1, popoli: ['roma'] }, [opt('buona', [{ stabilita: 1 }]), opt('cattiva', [{ stabilita: -1 }])])]);
  monthlyEvents(g);
  const pid = Object.keys(g.eventi)[0];
  assert.equal(applyCommand(g, { tipo: 'scegli', nazione: 'latini', evento: pid, opzione: 'buona' }).motivo, 'evento inesistente');
  assert.equal(applyCommand(g, { tipo: 'scegli', nazione: 'roma', evento: pid, opzione: 'boh' }).motivo, 'opzione inesistente');
  g.day = 60;
  expireEvents(g);
  assert.ok(g.eventi[pid]);
  g.day = 61;
  expireEvents(g);
  assert.equal(g.eventi[pid], undefined);
  assert.equal(g.nazioni.roma.stabilita, 1);
});

test('eventi orfani: popolo morto o evento tolto dal catalogo si scartano', () => {
  const g = makeGame(1, [ev('e', { probabilita: 1, popoli: ['roma', 'latini'] }, [opt('x', [])])]);
  monthlyEvents(g);
  const [p1, p2] = Object.keys(g.eventi);
  g.nazioni.roma.vivo = false;
  g.eventi[p2].evento = 'sparito';
  expireEvents(g);
  assert.deepEqual(g.eventi, {});
  assert.ok(p1);
});

test('riassunto degli effetti per Jev e per la finestra', () => {
  const g = makeGame();
  const e = { id: 'v1', evento: 'x', nazione: 'roma', altro: 'volsci', giorno: 0 };
  assert.equal(describeEffects(g, e, opt('a', [{ stabilita: 1 }, { tesoroMesi: -3 }, { uominiQuota: -0.2 }, { infamia: 2 }])),
    'stabilità +1, tesoro −3 mesi di entrate, riserva di uomini −20%, infamia +2');
  assert.equal(describeEffects(g, e, opt('b', [{ relazione: 40 }, { pretesto: true }, { pretestoAltro: true }, { guerra: true }])),
    'relazioni con volsci +40, pretesto contro volsci, volsci ottiene un pretesto contro di noi, volsci ci dichiara guerra');
  assert.equal(describeEffects(g, e, opt('c', [{ cambia_governo: 'repubblica' }, { slider: { societa: 1, guerra: -1 } }])),
    'governo: repubblica, società +1, dottrina −1');
  assert.equal(describeEffects(g, e, opt('d', [])), 'nessun effetto');
});

test('il giorno fa scattare gli eventi il primo del mese e li fa scadere', () => {
  const g = makeGame(1, [ev('e', { probabilita: 1, popoli: ['roma'] }, [opt('x', [{ stabilita: 1 }])])]);
  for (let i = 0; i < 12; i++) advanceDay(g);
  assert.equal(Object.values(g.eventi).length, 1);
  for (let i = 0; i < 70; i++) advanceDay(g);
  assert.equal(Object.values(g.eventi).length, 0);
  assert.equal(g.nazioni.roma.stabilita, 1);
});
```

- [ ] **Step 3: verificare che falliscano** — Run: `node --test test/events.test.js`. Expected: FAIL (`events.js` non esiste).

- [ ] **Step 4: war.js** — dopo `declareWar`:

```js
// Guerra decisa da un evento o da un risveglio: chi attacca riceve prima un pretesto, quindi non perde stabilità.
export function startWar(game, a, b) {
  game.nazioni[a].pretesti ??= {};
  game.nazioni[a].pretesti[b] = Math.max(game.nazioni[a].pretesti[b] ?? -1, game.day + 1);
  return declareWar(game, a, b);
}
```

- [ ] **Step 5: events.js**

```js
// Eventi: condizioni, scatto mensile, scelta ed effetti. Il catalogo sta in game.catalogo (non si salva).
import { log, clamp, bordersNation, provincesOf, maxManpower, newId, sliderOf } from './state.js';
import { nextRandom } from './rng.js';
import { dateFromDay } from './calendar.js';
import { monthlyIncome } from './economy.js';
import { changeRelation } from './diplomacy.js';
import { atWar, startWar } from './war.js';

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
  const ok = o => o !== id && vivo(game, o) && bordersNation(game, id, o) && (!a.culture || a.culture.includes(game.nazioni[o].cultura));
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
  const np = provincesOf(game, id).length;
  if (c.minProvince !== undefined && np < c.minProvince) return false;
  if (c.maxProvince !== undefined && np > c.maxProvince) return false;
  if (c.stabilitaMin !== undefined && n.stabilita < c.stabilitaMin) return false;
  if (c.stabilitaMax !== undefined && n.stabilita > c.stabilitaMax) return false;
  if (c.guerra !== undefined && c.guerra !== inGuerra(game, id)) return false;
  const fatti = game.eventiFatti[def.id] ?? [];
  const volta = c.unaVolta ?? 'popolo';
  if (volta === 'partita' && fatti.length) return false;
  if (volta === 'popolo' && fatti.includes(id)) return false;
  if (c.altro && !resolveOther(game, def, id)) return false;
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
  const altro = vivo(game, e.altro) ? e.altro : null;
  if (ALTRO.includes(k) && !altro) return; // l'altro è sparito: l'effetto su di lui si salta
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
      default: return describeExtra(game, k, v);
    }
  });
  return parti.length ? parti.join(', ') : 'nessun effetto';
}

// Effetti descritti da altri moduli (crea_popolo, Task 2).
function describeExtra(game, k, v) {
  return k;
}
```
Nota: nel test del riassunto i nomi dei popoli della fixture sono gli id (`nome: id`).

- [ ] **Step 6: collegamenti**
  - `balance.json`: `"eventi": { "scadenza": 60 }`.
  - `setup.js`: firma `createGame({ map, popoli, balance, catalogo = [], seed })`; nel gioco `catalogo: [...catalogo].sort((a, b) => (a.id < b.id ? -1 : 1)), eventi: {}, eventiFatti: {}`; commento dello stato con i tre campi (il catalogo "non si salva").
  - `loop.js`: dopo `expireProposals(game);` `expireEvents(game);`; nel blocco mensile, dopo `monthlyCulture(game);`, `monthlyEvents(game);`.
  - `commands.js`: `case 'scegli': return chooseOption(game, cmd.nazione, cmd.evento, cmd.opzione);`.

- [ ] **Step 7: verificare** — Run: `node --test test/events.test.js`. Expected: 11/11 PASS. Run: `npm test` (log nel workspace, tail). Expected: verde (235).

- [ ] **Step 8: commit** — `git add -A && git commit -m "feat: motore degli eventi: condizioni, scelte, effetti, scadenza"`.

---

### Task 2: Popoli dormienti

**Files:**
- Create: `public/js/sim/dormant.js`, `test/dormant.test.js`
- Modify: `public/js/sim/setup.js`, `public/js/sim/events.js` (`crea_popolo`), `public/data/popoli.json` (Neapolis ad Acerrae)

**Interfaces:**
- Consumes: `startWar` (Task 1), `initDiplomacy`, `initGovernment`, `checkSurvival`, `sendStrandedHome`.
- Produces: stato `game.dormienti` (`{ [id]: { id, nome, colore, cultura, governo, capitale, tratti } }`); `dormantReady(game, popolo, id) → bool`, `activateDormant(game, popolo, { esercito = 1, guerra = false, relazione = 0 }) → id|null` (dormant.js); effetto `{ crea_popolo: { popolo, esercito, guerra, relazione } }`; voce di log `nascita {nazione, prov, da}`.

- [ ] **Step 1: test che falliscono** — `test/dormant.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { dormantReady, activateDormant } from '../public/js/sim/dormant.js';
import { conditionsHold, eventDef, monthlyEvents, chooseOption, describeEffects } from '../public/js/sim/events.js';
import { atWar } from '../public/js/sim/war.js';
import { relation } from '../public/js/sim/diplomacy.js';
import { armiesOf } from '../public/js/sim/state.js';

const coloni = {
  id: 'coloni_taranto', titolo: 'Coloni', testo: 'Sbarcano.', condizioni: { probabilita: 1, unaVolta: 'partita' },
  opzioni: [
    { id: 'accogliere', testo: 'Accoglierli', effetti: [{ crea_popolo: { popolo: 'taranto', esercito: 1, relazione: 50 } }, { tesoroMesi: 3 }] },
    { id: 'respingere', testo: 'Respingerli', effetti: [{ crea_popolo: { popolo: 'taranto', esercito: 2, guerra: true } }] }
  ],
  regola: 'accogliere', storico: true
};

test('i dormienti stanno nello stato, fuori dai popoli attivi', () => {
  const g = makeGame();
  assert.deepEqual(Object.keys(g.dormienti), ['taranto']);
  assert.equal(g.dormienti.taranto.capitale, 'g');
  assert.equal(g.nazioni.taranto, undefined);
});

test('pronto solo se la capitale è del popolo che riceve l\'evento e non è la sua ultima provincia', () => {
  const g = makeGame();
  assert.equal(dormantReady(g, 'taranto', 'siculi'), false); // g è l'unica provincia dei siculi
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  assert.equal(dormantReady(g, 'taranto', 'siculi'), true);
  assert.equal(dormantReady(g, 'taranto', 'volsci'), false);
  g.province.g.controller = 'volsci';
  assert.equal(dormantReady(g, 'taranto', 'siculi'), false);
});

test('risveglio accolto: prende la provincia, ha un esercito, relazioni buone, nessuna guerra', () => {
  const g = makeGame();
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  assert.equal(activateDormant(g, 'taranto', { esercito: 1, relazione: 50 }), 'taranto');
  const n = g.nazioni.taranto;
  assert.equal(n.vivo, true);
  assert.equal(n.cultura, 'greca');
  assert.ok(g.ordine.includes('taranto'));
  assert.equal(g.dormienti.taranto, undefined);
  assert.equal(g.province.g.owner, 'taranto');
  assert.equal(g.province.g.assimilazioneDi, 'taranto');
  assert.equal(armiesOf(g, 'taranto').length, 1);
  assert.equal(armiesOf(g, 'taranto')[0].fanteria, 2 * 300);
  assert.equal(relation(g, 'taranto', 'siculi'), 50);
  assert.equal(atWar(g, 'taranto', 'siculi'), false);
  assert.equal(g.nazioni.siculi.capitale, 'f'); // la capitale persa passa alla provincia rimasta
  assert.deepEqual(n.slider, { societa: 0, guerra: 0, governo: 0 });
  assert.ok(g.log.some(e => e.tipo === 'nascita' && e.nazione === 'taranto' && e.prov === 'g' && e.da === 'siculi'));
});

test('risveglio respinto: esercito più grande e guerra senza perdita di stabilità', () => {
  const g = makeGame();
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  activateDormant(g, 'taranto', { esercito: 2, guerra: true });
  assert.equal(armiesOf(g, 'taranto')[0].fanteria, 2 * 300 * 2);
  assert.equal(atWar(g, 'taranto', 'siculi'), true);
  assert.equal(g.nazioni.taranto.stabilita, 0);
  assert.equal(activateDormant(g, 'taranto', {}), null); // già sveglio
});

test('evento di risveglio: scatta solo per il padrone della capitale e porta il popolo', () => {
  const g = makeGame(1, [coloni]);
  assert.equal(conditionsHold(g, eventDef(g, 'coloni_taranto'), 'siculi'), false);
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  assert.equal(conditionsHold(g, eventDef(g, 'coloni_taranto'), 'siculi'), true);
  assert.equal(conditionsHold(g, eventDef(g, 'coloni_taranto'), 'roma'), false);
  monthlyEvents(g);
  const e = Object.values(g.eventi).find(x => x.nazione === 'siculi');
  assert.equal(describeEffects(g, e, coloni.opzioni[1]), 'nasce taranto (esercito ×2), in guerra con noi'); // nella fixture il nome è l'id
  assert.deepEqual(chooseOption(g, 'siculi', e.id, 'respingere'), { ok: true });
  assert.equal(atWar(g, 'taranto', 'siculi'), true);
});

test('se la capitale ha cambiato padrone dopo lo scatto, il risveglio si salta senza eliminare nessuno', () => {
  const g = makeGame(1, [coloni]);
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  monthlyEvents(g);
  const e = Object.values(g.eventi).find(x => x.nazione === 'siculi');
  g.province.f.owner = 'volsci'; g.province.f.controller = 'volsci'; // ai siculi resta solo g
  chooseOption(g, 'siculi', e.id, 'accogliere');
  assert.equal(g.nazioni.siculi.vivo, true);
  assert.equal(g.province.g.owner, 'siculi');
  assert.ok(g.dormienti.taranto);
});
```

- [ ] **Step 2: verificare che falliscano** — Run: `node --test test/dormant.test.js`. Expected: FAIL (`dormant.js` non esiste).

- [ ] **Step 3: dormant.js**

```js
// Popoli dormienti: si risvegliano con un evento e prendono la loro provincia capitale dal padrone.
import { provincesOf, maxManpower, recruitBonus, createArmy, log } from './state.js';
import { initDiplomacy, changeRelation } from './diplomacy.js';
import { initGovernment } from './government.js';
import { checkSurvival, sendStrandedHome, startWar } from './war.js';

// Il risveglio è possibile se la capitale del dormiente è di `id`, controllata da lui, e non è la sua ultima provincia.
export function dormantReady(game, popolo, id) {
  const d = game.dormienti[popolo];
  if (!d) return false;
  const p = game.province[d.capitale];
  return p.owner === id && p.controller === id && provincesOf(game, id).length > 1;
}

export function activateDormant(game, popolo, { esercito = 1, guerra = false, relazione = 0 } = {}) {
  const d = game.dormienti[popolo];
  if (!d) return null;
  const p = game.province[d.capitale], vecchio = p.owner, b = game.balance;
  if (!dormantReady(game, popolo, vecchio)) return null; // la capitale è cambiata di mano: niente risveglio
  delete game.dormienti[popolo];
  game.nazioni[popolo] = {
    id: popolo, nome: d.nome, colore: d.colore, cultura: d.cultura, governo: d.governo, capitale: p.id,
    tesoro: p.tasse * b.economia.tasseMese * b.inizio.tesoroMesi, uomini: 0, stabilita: 0, infamia: 0,
    tratti: { ...d.tratti }, vivo: true, tregue: {}, obiettivo: null
  };
  game.ordine.push(popolo);
  initDiplomacy(game);
  initGovernment(game);
  p.owner = popolo;
  p.controller = popolo;
  p.assimilazione = 0;
  p.assimilazioneDi = popolo;
  p.colonia = null;
  p.ribelliDal = null;
  const n = game.nazioni[popolo], bonus = 1 + recruitBonus(game, popolo);
  n.uomini = Math.round(maxManpower(game, popolo) * b.inizio.riservaQuota);
  createArmy(game, popolo, p.id,
    Math.round(p.uomini * b.inizio.fanteriaPerUomo * bonus * esercito),
    Math.round(p.uomini * b.inizio.cavalleriaPerUomo * bonus * esercito));
  log(game, { tipo: 'nascita', nazione: popolo, prov: p.id, da: vecchio });
  if (relazione) changeRelation(game, popolo, vecchio, relazione);
  checkSurvival(game);
  if (guerra) startWar(game, popolo, vecchio);
  sendStrandedHome(game);
  return popolo;
}
```

- [ ] **Step 4: setup.js** — dopo il ciclo dei popoli attivi:

```js
  // i dormienti aspettano un evento: si tengono nello stato per poterli risvegliare
  game.dormienti = {};
  for (const n of popoli.popoli.filter(x => x.dormiente)) {
    game.dormienti[n.id] = { id: n.id, nome: n.nome, colore: n.colore, cultura: n.cultura, governo: n.governo, capitale: n.capitale, tratti: { ...n.tratti } };
  }
```
(il campo va nel commento dello stato).

- [ ] **Step 5: events.js** — import `dormantReady, activateDormant` da `dormant.js`; in `conditionsHold`, prima di `return true`:

```js
  // un risveglio scatta solo per il padrone della capitale del dormiente
  for (const o of def.opzioni) for (const eff of o.effetti) {
    if (eff.crea_popolo && !dormantReady(game, eff.crea_popolo.popolo, id)) return false;
  }
```
in `applyEffect`: `case 'crea_popolo': activateDormant(game, v.popolo, v); break;`; in `describeExtra`:

```js
function describeExtra(game, k, v) {
  if (k !== 'crea_popolo') return k;
  const nome = game.dormienti[v.popolo]?.nome ?? game.nazioni[v.popolo]?.nome ?? v.popolo;
  return `nasce ${nome}${(v.esercito ?? 1) !== 1 ? ` (esercito ×${v.esercito})` : ''}${v.guerra ? ', in guerra con noi' : ''}${v.relazione ? `, relazioni ${segno(v.relazione)}` : ''}`;
}
```

- [ ] **Step 6: Neapolis** — in `popoli.json` `neapolis.capitale` da `cumae` a `acerrae` (Cuma ha una sola provincia; Acerrae confina con Cuma ed è la più vicina a Napoli). Ruling nel registro.

- [ ] **Step 7: verificare** — Run: `node --test test/dormant.test.js`. Expected: 6/6 PASS. `npm test` (log). Expected: verde (241).

- [ ] **Step 8: commit** — `git commit -m "feat: popoli dormienti risvegliati dagli eventi"` (con `git add` dei file nuovi).

---

### Task 3: Validatore e catalogo

**Files:**
- Create: `public/js/sim/validate-events.js`, `tools/validate-events.js`, `test/events-data.test.js`, `public/data/eventi/generici.json`, `public/data/eventi/governo.json`, `public/data/eventi/storici.json`, `public/data/eventi/dormienti.json`
- Modify: `tools/load-data.js`, `package.json` (script `validate-events`)

**Interfaces:**
- Produces: `validateEvents(catalogo, { map, popoli, balance }) → string[]` (vuoto se valido); `EVENTI_FILE = ['generici', 'governo', 'storici', 'dormienti']`; `loadData()` restituisce anche `catalogo` (array unito dei quattro file); formato file `{ "eventi": [ ... ] }`.

- [ ] **Step 1: test che falliscono** — `test/events-data.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../tools/load-data.js';
import { validateEvents } from '../public/js/sim/validate-events.js';

const data = loadData();
const buono = () => ({
  id: 'prova', titolo: 'Prova', testo: 'Un testo.', condizioni: { probabilita: 0.01, anni: [700, 600], altro: {} },
  opzioni: [{ id: 'a', testo: 'A', effetti: [{ stabilita: 1 }, { relazione: 10 }] }], regola: 'a'
});

test('il catalogo vero è valido e copre i 13 dormienti', () => {
  assert.deepEqual(validateEvents(data.catalogo, data), []);
  assert.ok(data.catalogo.length >= 35, String(data.catalogo.length));
  const dormienti = data.popoli.popoli.filter(p => p.dormiente).map(p => p.id);
  for (const d of dormienti) {
    assert.ok(data.catalogo.some(e => e.opzioni.some(o => o.effetti.some(x => x.crea_popolo?.popolo === d))), d);
  }
});

test('il validatore trova gli errori', () => {
  assert.deepEqual(validateEvents([buono()], data), []);
  const casi = [
    [e => { e.id = 'Con Spazi'; }, /id/],
    [e => { e.condizioni.probabilita = 0; }, /probabilita/],
    [e => { e.condizioni.anni = [600, 700]; }, /anni/],
    [e => { e.condizioni.popoli = ['atlantide']; }, /popolo/],
    [e => { e.condizioni.governi = ['impero']; }, /governo/],
    [e => { e.condizioni.provincia = 'nessuna'; }, /provincia/],
    [e => { e.condizioni.unaVolta = 'mai'; }, /unaVolta/],
    [e => { e.opzioni[0].effetti.push({ magia: 1 }); }, /effetto/],
    [e => { e.opzioni[0].effetti.push({ stabilita: 1, tesoroMesi: 1 }); }, /effetto/],
    [e => { delete e.condizioni.altro; }, /altro/],
    [e => { e.opzioni[0].effetti.push({ crea_popolo: { popolo: 'roma' } }); }, /dormiente/],
    [e => { e.opzioni[0].effetti.push({ cambia_governo: 'impero' }); }, /governo/],
    [e => { e.opzioni[0].effetti.push({ slider: { morale: 1 } }); }, /slider/],
    [e => { e.regola = 'z'; }, /regola/],
    [e => { e.opzioni = []; }, /opzioni/]
  ];
  for (const [rompi, atteso] of casi) {
    const e = buono();
    rompi(e);
    const err = validateEvents([e], data);
    assert.ok(err.some(x => atteso.test(x)), `${atteso}: ${err.join(' | ')}`);
  }
  assert.ok(validateEvents([buono(), buono()], data).some(x => /ripetuto/.test(x)));
});
```

- [ ] **Step 2: verificare che falliscano** — Run: `node --test test/events-data.test.js`. Expected: FAIL.

- [ ] **Step 3: validate-events.js**

```js
// Controllo del catalogo degli eventi: ogni riferimento esiste, ogni effetto è noto. Restituisce gli errori.
import { SLIDER } from './government.js';

const ID = /^[a-z0-9_]+$/;
const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const isNum = n => typeof n === 'number' && Number.isFinite(n);
const isStr = s => typeof s === 'string' && s.length > 0;
const SUL_ALTRO = ['relazione', 'pretesto', 'pretestoAltro', 'guerra'];

export function validateEvents(catalogo, { map, popoli, balance }) {
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
```

- [ ] **Step 4: caricamento e riga di comando**
  - `tools/load-data.js`: `export const EVENTI_FILE = ['generici', 'governo', 'storici', 'dormienti'];` e `catalogo: EVENTI_FILE.flatMap(f => read(\`eventi/${f}.json\`).eventi)`.
  - `tools/validate-events.js`:

```js
// Controlla il catalogo degli eventi. Uso: npm run validate-events
import { loadData } from './load-data.js';
import { validateEvents } from '../public/js/sim/validate-events.js';

const data = loadData();
const errori = validateEvents(data.catalogo, data);
for (const e of errori) console.error(e);
console.log(errori.length ? `${errori.length} errori` : `${data.catalogo.length} eventi validi`);
process.exit(errori.length ? 1 : 0);
```
  - `package.json`: `"validate-events": "node tools/validate-events.js"`.

- [ ] **Step 5: catalogo (subagente)** — lavoro di dati: un subagente scrive i quattro file seguendo questa tabella, con titoli e testi in italiano (testo: 2-3 frasi d'epoca, nessun anacronismo; testo delle opzioni: una frase con la scelta, senza numeri: i numeri li mostra il riassunto degli effetti), poi esegue `npm run validate-events` e `node --test test/events-data.test.js` finché sono verdi. Gli effetti, le condizioni e le regole sono quelli della tabella, esattamente.

`generici.json` (tutti `unaVolta: false`):

| id | condizioni | opzioni: effetti | regola |
|---|---|---|---|
| carestia | p 0.003 | compra_grano: tesoroMesi −3 · razionare: stabilita −1 | compra_grano |
| pestilenza | p 0.002 | purificare: tesoroMesi −2 · isolare: uominiQuota −0.2 | isolare |
| buon_raccolto | p 0.004 | feste: stabilita +1, tesoroMesi −1 · granai: tesoroMesi +3 | granai |
| piena_del_fiume | p 0.002, minProvince 2 | argini: tesoroMesi −2 · lasciare: uominiQuota −0.1, stabilita −1 | argini |
| alleanza_matrimoniale | p 0.002, guerra false, altro {} | accettare: relazione +40, tesoroMesi −1 · rifiutare: relazione −20 | accettare |
| disordini_plebe | p 0.003, stabilitaMax 0 | concessioni: slider {societa +1}, stabilita +1 · repressione: stabilita −1, uominiQuota −0.1 | concessioni |
| oracolo | p 0.002 | consultare: tesoroMesi −1, stabilita +1 · ignorare: (nessuno) | consultare |
| incendio | p 0.002, minProvince 3 | ricostruire: tesoroMesi −3 · abbandonare: stabilita −1 | ricostruire |
| mercanti_stranieri | p 0.002 | accogliere: tesoroMesi +3 · cacciare: stabilita +1 | accogliere |
| eroe_di_guerra | p 0.004, guerra true | onorare: stabilita +1, tesoroMesi −1 · arruolare: uominiQuota +0.15 | arruolare |
| tradimento | p 0.002, guerra true | giustiziare: stabilita +1, infamia +1 · esiliare: stabilita −1 | giustiziare |
| ambasceria_straniera | p 0.002, altro {} | doni: tesoroMesi −1, relazione +30 · congedo: relazione −10 | doni |
| contesa_confini | p 0.002, guerra false, altro {} | rivendicare: pretesto, relazione −30 · trattare: relazione +20, tesoroMesi −1 | trattare |

`governo.json` (`unaVolta: 'popolo'` salvo dove detto):

| id | condizioni | opzioni: effetti | regola |
|---|---|---|---|
| cacciata_del_re | p 0.01, anni [600, 264], governi [monarchia], stabilitaMax 0, storico | repubblica: cambia_governo repubblica, stabilita +1 · repressione: stabilita −1, uominiQuota −0.2 | repubblica |
| re_delle_tribu | p 0.01, governi [tribù], minProvince 5 | incoronare: cambia_governo monarchia, stabilita +1 · consiglio_anziani: tesoroMesi +1 | incoronare |
| tirannide | p 0.02, governi [città-stato], stabilitaMax −2 | tiranno: cambia_governo monarchia, infamia +2 · resistere: stabilita −1 | resistere |
| lega_dei_popoli | p 0.005, governi [tribù], minProvince 3, maxProvince 6 | lega: cambia_governo lega · restare: (nessuno) | lega |
| dittatore | p 0.02, governi [repubblica], guerra true, stabilitaMax 0, unaVolta false | nominare: stabilita +2, infamia +1 · rifiutare: stabilita −1 | nominare |

`storici.json` (tutti `storico: true`, `unaVolta: 'partita'` salvo dove detto):

| id | condizioni | opzioni: effetti | regola |
|---|---|---|---|
| ratto_sabine | p 0.02, anni [753, 700], culture [latina], altro {preferiti [sabini]} | ratto: uominiQuota +0.2, relazione −60, pretestoAltro · trattative: relazione +20, tesoroMesi −2 | ratto |
| superbia_del_re | p 0.05, anni [515, 495], governi [monarchia], culture [latina], unaVolta 'popolo' | cacciare: cambia_governo repubblica, stabilita −1 · tenere: stabilita −2 | cacciare |
| orazi_curiazi | p 0.02, anni [700, 640], culture [latina], altro {preferiti [lega_latina], culture [latina]} | duello: stabilita +1, pretesto · pace: relazione +30 | duello |
| dodici_tavole | p 0.05, anni [460, 440], governi [repubblica, città-stato] | leggi: slider {societa +1}, stabilita +1 · patrizi: slider {societa −1}, stabilita −1 | leggi |
| secessione_plebe | p 0.01, anni [500, 280], governi [repubblica], stabilitaMax 0, unaVolta 'popolo' | tribuni: slider {societa +1}, stabilita +1 · resistere: stabilita −2 | tribuni |
| sacco_gallico | p 0.02, anni [395, 380], altro {preferiti [senoni, boi, insubri], soloPreferiti true} | riscatto: tesoroMesi −6, stabilita −1 · resistenza: guerra | riscatto |
| guerre_sannitiche | p 0.01, anni [345, 290], guerra false, altro {preferiti [sanniti], soloPreferiti true}, unaVolta 'popolo' | aiuto_ai_campani: pretesto, relazione −30 · neutralita: relazione +20 | aiuto_ai_campani |

`dormienti.json` (tutti `storico: true`, `unaVolta: 'partita'`, probabilità 0.08; anni = [anno storico + 3, anno storico − 20]):

| id | popolo (anno) | opzioni: effetti | regola |
|---|---|---|---|
| coloni_<popolo> per siracusa (734), reggio (720), sibari (720), crotone (710), taranto (706), gela (688), locri (680), neapolis (470) | colonia greca | accogliere: crea_popolo {popolo, esercito 1, relazione 50}, tesoroMesi +3 · respingere: crea_popolo {popolo, esercito 2, guerra true} | accogliere |
| invasione_lucani (420) | lucani | invasione: crea_popolo {popolo lucani, esercito 3, guerra true} | invasione |
| invasione_bruzi (356) | bruzi | invasione: crea_popolo {popolo bruzi, esercito 3, guerra true} | invasione |
| invasione_senoni (395) | senoni | invasione: crea_popolo {popolo senoni, esercito 4, guerra true} | invasione |
| invasione_boi (400) | boi | invasione: crea_popolo {popolo boi, esercito 4, guerra true} | invasione |
| invasione_insubri (400) | insubri | invasione: crea_popolo {popolo insubri, esercito 4, guerra true} | invasione |

Totale: 13 + 5 + 7 + 13 = 38 eventi. (La monarchia tende a stabilità +1: per questo la cacciata scatta già a stabilità 0, e la superbia del re non chiede stabilità bassa.)

- [ ] **Step 6: verificare** — Run: `npm run validate-events`. Expected: `38 eventi validi`. Run: `node --test test/events-data.test.js`. Expected: 2/2 PASS. Rileggere a campione 5 testi (anacronismi, numeri nel testo delle opzioni). `npm test` (log). Expected: verde; se un test di sessione con dati veri si ferma ora per un evento del giocatore (`runDays` con motivo `evento`), lo si adatta rispondendo all'evento o scegliendo un seme senza eventi nei giorni del test, con una riga `Ruling:`.

- [ ] **Step 7: commit** — `git commit -m "feat: catalogo di 38 eventi e validatore"`.

---

### Task 4: IA — regole e Jev sugli eventi

**Files:**
- Modify: `public/js/ai/rules.js`, `public/js/ai/questions.js`, `public/js/ai/jev.js`, `public/js/ui/views.js` (`DOMANDE.evento`), `test/rules.test.js`, `test/questions.test.js`, `test/jev.test.js`

**Interfaces:**
- Consumes: `eventDef`, `describeEffects` (Task 1), `sampleChoice` (tappa 4b).
- Produces: `eventAnswers(game, id) → cmd[]` (rules.js); `buildEventQuestion(game, pid, carattere) → {state, questions, meta}` (questions.js); domanda di registro `evento`.

- [ ] **Step 1: test che falliscono**

`test/rules.test.js` (import `eventAnswers`):

```js
test('regole sugli eventi: scelgono l\'opzione indicata dall\'evento', () => {
  const g = makeGame(1, [{ id: 'e', titolo: 'E', testo: 'T.', condizioni: { probabilita: 1, popoli: ['roma'] },
    opzioni: [{ id: 'a', testo: 'A', effetti: [] }, { id: 'b', testo: 'B', effetti: [{ stabilita: 1 }] }], regola: 'b' }]);
  monthlyEvents(g);
  const pid = Object.keys(g.eventi)[0];
  assert.deepEqual(eventAnswers(g, 'roma'), [{ tipo: 'scegli', nazione: 'roma', evento: pid, opzione: 'b' }]);
  assert.deepEqual(eventAnswers(g, 'latini'), []);
  assert.ok(rulesController(g, 'roma').some(c => c.tipo === 'scegli'));
});
```
(import `monthlyEvents` da `events.js`.)

`test/questions.test.js` (import `buildEventQuestion`, `monthlyEvents`):

```js
test('domanda su un evento: opzioni con il riassunto degli effetti, l\'altro per nome', () => {
  const g = makeGame(1, [{ id: 'e', titolo: 'Contesa', testo: 'Un confine conteso.', condizioni: { probabilita: 1, popoli: ['roma'], altro: { preferiti: ['volsci'] } },
    opzioni: [{ id: 'rivendicare', testo: 'Rivendicare', effetti: [{ pretesto: true }] }, { id: 'trattare', testo: 'Trattare', effetti: [{ relazione: 20 }] }], regola: 'trattare' }]);
  monthlyEvents(g);
  const pid = Object.keys(g.eventi)[0];
  const q = buildEventQuestion(g, pid, 'Ambiziosa.');
  assert.equal(q.state.evento.titolo, 'Contesa');
  assert.equal(q.state.evento.altro, 'volsci');
  assert.deepEqual(q.questions.evento.criteria, {
    rivendicare: 'Rivendicare (pretesto contro volsci)',
    trattare: 'Trattare (relazioni con volsci +20)'
  });
  assert.deepEqual(q.meta.evento, { tipo: 'evento', evento: pid, mappa: { rivendicare: 'rivendicare', trattare: 'trattare' }, prudente: 'trattare' });
});
```

`test/jev.test.js`:

```js
test('Jev sceglie negli eventi: comando secondo la risposta, registro con la domanda', async () => {
  const cat = [{ id: 'e', titolo: 'E', testo: 'T.', condizioni: { probabilita: 1, popoli: ['roma'] },
    opzioni: [{ id: 'a', testo: 'A', effetti: [] }, { id: 'b', testo: 'B', effetti: [{ stabilita: 1 }] }], regola: 'a' }];
  const g = makeGame(1, cat);
  const records = [];
  const ask = async ({ questions }) => ({
    answers: Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, k === 'evento'
      ? { type: 'choice', choice: 'b', probabilities: { b: 1 }, confidence: 1 }
      : { type: 'choice', choice: Object.keys(q.criteria)[0], probabilities: { [Object.keys(q.criteria)[0]]: 1 }, confidence: 1 }])),
    usage: { input_tokens: 1, output_tokens: 1 }
  });
  const ai = createJevAi({ ask, caratteri, onRecord: r => records.push(r) });
  await play(g, { roma: ai.controller }, ai, 40);
  const r = records.find(x => x.domande.some(d => d.domanda === 'evento'));
  assert.ok(r);
  assert.equal(r.comandi.find(c => c.tipo === 'scegli').opzione, 'b');
  assert.equal(g.nazioni.roma.stabilita, 1);
  assert.deepEqual(g.eventi, {});
});
```

- [ ] **Step 2: verificare che falliscano** — Run: `node --test test/rules.test.js test/questions.test.js test/jev.test.js`. Expected: FAIL.

- [ ] **Step 3: rules.js**

```js
// Eventi in attesa: le regole prendono l'opzione indicata dall'evento.
export function eventAnswers(game, id) {
  return Object.values(game.eventi).filter(e => e.nazione === id).map(e =>
    ({ tipo: 'scegli', nazione: id, evento: e.id, opzione: eventDef(game, e.evento)?.regola })).filter(c => c.opzione);
}
```
`rulesController`: `const cmds = [...answerProposals(game, id), ...eventAnswers(game, id)];` (import `eventDef` da `events.js`).

- [ ] **Step 4: questions.js**

```js
export function buildEventQuestion(game, pid, carattere) {
  const e = game.eventi[pid], def = eventDef(game, e.evento);
  const state = statoPopolo(game, e.nazione, carattere);
  state.evento = { titolo: def.titolo, testo: def.testo, ...(e.altro ? { altro: nome(game, e.altro) } : {}) };
  return {
    state,
    questions: {
      evento: {
        type: 'choice',
        instructions: 'Sei il consiglio di `popolo.nome` e decidi secondo `popolo.carattere`. Davanti a `evento`, quale strada scegli?',
        criteria: Object.fromEntries(def.opzioni.map(o => [o.id, `${o.testo} (${describeEffects(game, e, o)})`]))
      }
    },
    meta: { evento: { tipo: 'evento', evento: pid, mappa: Object.fromEntries(def.opzioni.map(o => [o.id, o.id])), prudente: def.regola } }
  };
}
```
(import `eventDef, describeEffects` da `../sim/events.js`.)

- [ ] **Step 5: jev.js**
  - `controller`: dopo il ciclo delle proposte,

```js
    for (const e of Object.values(game.eventi)) {
      if (e.nazione !== id || chieste.has(e.id)) continue;
      chieste.add(e.id);
      const q = buildEventQuestion(game, e.id, caratteri[id] ?? '');
      enqueue({ nazione: id, giorno: game.day, req: { state: q.state, questions: q.questions }, meta: q.meta });
    }
```
  - `applica`, prima del ramo `slider`:

```js
      if (meta.tipo === 'evento') {
        const e = game.eventi[meta.evento];
        if (!e) { record.domande.push({ domanda: 'evento', scelta: null, fonte: 'superata', probabilita: null }); continue; }
        const v = usabile ? sampleChoice(ans, meta, job.seq * 100003 + job.giorno) : null;
        const opzione = v ? v.valore : eventDef(game, e.evento).regola;
        record.comandi.push({ tipo: 'scegli', nazione: id, evento: meta.evento, opzione });
        record.domande.push({ domanda: 'evento', scelta: opzione, fonte: v ? 'jev' : 'regola', probabilita: v ? v.probabilita : null });
        continue;
      }
```
  - `views.js` `DOMANDE`: `evento: 'Evento'`.
  - Il rigioco non cambia: i comandi `scegli` arrivano dal registro.

- [ ] **Step 6: verificare** — Run: `node --test test/rules.test.js test/questions.test.js test/jev.test.js test/bench.test.js`. Expected: PASS (il rigioco del bench misto resta identico: Review Focus 5). `npm test` (log). Expected: verde.

- [ ] **Step 7: commit** — `git commit -am "feat: regole e Jev scelgono negli eventi"`.

---

### Task 5: Salvataggi

**Files:**
- Modify: `public/js/ui/save.js`, `test/save.test.js`

**Interfaces:**
- Consumes: `data.catalogo`, `game.eventi`, `game.eventiFatti`, `game.dormienti`.

- [ ] **Step 1: test che falliscono** — in `test/save.test.js`:

```js
test('eventi in attesa, eventi fatti e dormienti: andata e ritorno; catalogo non salvato', () => {
  const s = createSession(data, 'volsci', 3);
  runDays(s, 400);
  const g = s.game;
  g.eventi.v999 = { id: 'v999', evento: 'carestia', nazione: 'roma', altro: null, giorno: g.day };
  const text = serialize(s);
  assert.equal(text.includes('"catalogo"'), false);
  const r = deserialize(text, data);
  assert.equal(r.ok, true, r.motivo);
  assert.deepEqual(r.session.game, g);
});

test('salvataggio vecchio senza eventi né dormienti: valori iniziali dai dati', () => {
  const s = createSession(data, 'roma', 1);
  const old = JSON.parse(serialize(s));
  delete old.game.eventi; delete old.game.eventiFatti; delete old.game.dormienti;
  const r = deserialize(JSON.stringify(old), data);
  assert.equal(r.ok, true, r.motivo);
  assert.deepEqual(r.session.game.eventi, {});
  assert.equal(Object.keys(r.session.game.dormienti).length, 13);
});

test('evento orfano (tolto dal catalogo) si carica e poi si scarta', () => {
  const s = createSession(data, 'roma', 1);
  const x = JSON.parse(serialize(s));
  x.game.eventi.v998 = { id: 'v998', evento: 'evento_sparito', nazione: 'veio', altro: null, giorno: 0 };
  const r = deserialize(JSON.stringify(x), data);
  assert.equal(r.ok, true, r.motivo);
  runDays(r.session, 1);
  assert.equal(r.session.game.eventi.v998, undefined);
});

test('eventi e dormienti non validi: rifiutati', () => {
  const s = createSession(data, 'roma', 1);
  const good = JSON.parse(serialize(s));
  const guasta = f => { const x = structuredClone(good); f(x.game); return JSON.stringify(x); };
  const bad = [
    guasta(g => { g.eventi = { v1: { id: 'v1', evento: 'carestia', nazione: 'atlantide', altro: null, giorno: 0 } }; }),
    guasta(g => { g.eventi = { v1: { id: 'v2', evento: 'carestia', nazione: 'roma', altro: null, giorno: 0 } }; }),
    guasta(g => { g.eventi = { v1: { id: 'v1', evento: 3, nazione: 'roma', altro: null, giorno: 0 } }; }),
    guasta(g => { g.eventiFatti = { carestia: ['atlantide'] }; }),
    guasta(g => { g.dormienti.taranto.capitale = 'atlantide'; }),
    guasta(g => { g.dormienti.roma = { ...g.dormienti.taranto, id: 'roma' }; }) // già attivo
  ];
  for (const text of bad) assert.equal(deserialize(text, data).ok, false, text.slice(0, 80));
});
```

- [ ] **Step 2: verificare che falliscano** — Run: `node --test test/save.test.js`. Expected: FAIL.

- [ ] **Step 3: save.js**
  - `serialize`: `const { balance, catalogo, ...game } = session.game;`.
  - `deserialize`: `const g = { ...s.game, balance: data.balance, catalogo: [...(data.catalogo ?? [])].sort((a, b) => (a.id < b.id ? -1 : 1)) };` e, dopo `initCulture(g)`:

```js
  g.eventi ??= {};
  g.eventiFatti ??= {};
  // i salvataggi precedenti agli eventi ricevono i dormienti non ancora in partita
  g.dormienti ??= Object.fromEntries(data.popoli.popoli.filter(p => p.dormiente && !g.nazioni[p.id]).map(p =>
    [p.id, { id: p.id, nome: p.nome, colore: p.colore, cultura: p.cultura, governo: p.governo, capitale: p.capitale, tratti: { ...p.tratti } }]));
```
  - `validateGame`, prima di `return null`:

```js
  if (g.eventi !== undefined) {
    if (!isObj(g.eventi)) return 'eventi';
    for (const [k, e] of Object.entries(g.eventi)) {
      if (!ID.test(k) || !isObj(e) || e.id !== k || !isStr(e.evento) || !attiva(e.nazione) || !isInt(e.giorno)) return `evento ${k}`;
      if (e.altro !== null && !attiva(e.altro)) return `evento ${k}`;
    }
  }
  if (g.eventiFatti !== undefined && !(isObj(g.eventiFatti) && Object.values(g.eventiFatti).every(l => Array.isArray(l) && l.every(attiva)))) return 'eventi fatti';
  if (g.dormienti !== undefined) {
    if (!isObj(g.dormienti)) return 'dormienti';
    for (const [k, d] of Object.entries(g.dormienti)) {
      if (!ID.test(k) || own(g.nazioni, k) || !isObj(d) || d.id !== k) return `dormiente ${k}`;
      if (![d.nome, d.colore, d.cultura, d.governo].every(isStr) || !provincia(d.capitale)) return `dormiente ${k}`;
      if (!isObj(d.tratti) || !Object.values(d.tratti).every(isNum)) return `dormiente ${k}`;
    }
  }
```
Un evento orfano (non nel catalogo) è valido al caricamento: lo scarta `expireEvents` il giorno dopo (Review Focus 4).

- [ ] **Step 4: verificare** — Run: `node --test test/save.test.js`. Expected: PASS. `npm test` (log). Expected: verde.

- [ ] **Step 5: commit** — `git commit -am "feat: salvataggi con eventi e popoli dormienti"`.

---

### Task 6: Interfaccia e prova di fumo

**Files:**
- Modify: `public/js/ui/session.js`, `public/js/ui/views.js`, `public/js/ui/panels.js`, `public/js/main.js`, `tools/smoke.mjs`, `test/clock-session.test.js`, `test/views.test.js`, `test/panels.test.js`

**Interfaces:**
- Produces: `pausaNecessaria` restituisce `'evento'`; `pendingEvents(game, g) → [{ id, titolo, testo, opzioni: [{ id, testo, effetti }] }]` (views.js); `eventoHtml(v)` (panels.js); notizie `nascita`, `governo`, `evento` storico.

- [ ] **Step 1: test che falliscono**

`test/clock-session.test.js`:

```js
test('sessione: si ferma per un evento del giocatore e riparte dopo la scelta', () => {
  const s = createSession(data, 'roma', 1);
  s.game.eventi.v1 = { id: 'v1', evento: 'carestia', nazione: 'roma', altro: null, giorno: s.game.day };
  assert.equal(runDays(s, 10).motivo, 'evento');
  assert.equal(applyCommand(s.game, { tipo: 'scegli', nazione: 'roma', evento: 'v1', opzione: 'compra_grano' }).ok, true);
  assert.equal(runDays(s, 1).giorni, 1);
});
```
(import `applyCommand` da `commands.js`.)

`test/views.test.js`:

```js
test('eventi del giocatore e notizie di nascite, governi, eventi storici', () => {
  const g = makeGame(1, [{ id: 'e', titolo: 'Carestia', testo: 'Il raccolto è perduto.', condizioni: { probabilita: 1, popoli: ['roma'] },
    opzioni: [{ id: 'a', testo: 'Comprare grano', effetti: [{ tesoroMesi: -3 }] }], regola: 'a', storico: true }]);
  monthlyEvents(g);
  const [v] = V.pendingEvents(g, 'roma');
  assert.equal(v.titolo, 'Carestia');
  assert.deepEqual(v.opzioni, [{ id: 'a', testo: 'Comprare grano', effetti: 'tesoro −3 mesi di entrate' }]);
  assert.deepEqual(V.pendingEvents(g, 'latini'), []);
  assert.equal(V.formatLogEntry({ tipo: 'nascita', nazione: 'latini', prov: 'd', da: 'roma' }, g, 'roma'), 'Nasce latini a D.');
  assert.equal(V.formatLogEntry({ tipo: 'governo', nazione: 'latini', governo: 'repubblica' }, g, 'roma'), 'latini diventa una repubblica.');
  assert.equal(V.formatLogEntry({ tipo: 'evento', evento: 'e', nazione: 'latini', opzione: 'a', storico: true }, g, 'roma'), 'latini: Carestia.');
  assert.equal(V.formatLogEntry({ tipo: 'evento', evento: 'e', nazione: 'roma', opzione: 'a', storico: true }, g, 'roma'), null);
  assert.equal(V.formatLogEntry({ tipo: 'evento', evento: 'e', nazione: 'latini', opzione: 'a', storico: false }, g, 'roma'), null);
});
```
(import `monthlyEvents`.)

`test/panels.test.js`: `eventoHtml({ id: evil, titolo: evil, testo: evil, opzioni: [{ id: evil, testo: evil, effetti: evil }] })` non contiene `<img`.

- [ ] **Step 2: verificare che falliscano** — Run: `node --test test/clock-session.test.js test/views.test.js test/panels.test.js`. Expected: FAIL.

- [ ] **Step 3: codice**
  - `session.js` `pausaNecessaria`: dopo il controllo delle proposte, `if (Object.values(game.eventi ?? {}).some(e => e.nazione === giocatore)) return 'evento';`.
  - `views.js`:

```js
const GOVERNI_ART = { 'tribù': 'una tribù', monarchia: 'una monarchia', repubblica: 'una repubblica', lega: 'una lega', 'città-stato': 'una città-stato' };

export function pendingEvents(game, g) {
  return Object.values(game.eventi).filter(e => e.nazione === g).map(e => {
    const def = eventDef(game, e.evento);
    return def && {
      id: e.id, titolo: def.titolo, testo: def.testo,
      opzioni: def.opzioni.map(o => ({ id: o.id, testo: o.testo, effetti: describeEffects(game, e, o) }))
    };
  }).filter(Boolean);
}
```
    `formatLogEntry`: `case 'nascita': return \`Nasce ${N(e.nazione)} a ${P(e.prov)}.\`;` `case 'governo': return \`${N(e.nazione)} diventa ${GOVERNI_ART[e.governo] ?? e.governo}.\`;` `case 'evento': return e.storico && e.nazione !== g ? \`${N(e.nazione)}: ${eventDef(game, e.evento)?.titolo ?? e.evento}.\` : null;` e il commento sopra la funzione aggiunge nascite, governi ed eventi storici tra le notizie per tutti.
  - `panels.js`:

```js
export function eventoHtml(v) {
  return `<h2>${esc(v.titolo)}</h2><p>${esc(v.testo)}</p>` + v.opzioni.map(o =>
    `<div class="opzione"><button data-azione="scegli" data-id="${esc(v.id)}" data-opzione="${esc(o.id)}">${esc(o.testo)}</button>` +
    `<div class="muto">${esc(o.effetti)}</div></div>`).join('');
}
```
  - `main.js`:
    - caricamento: i quattro file `eventi/<nome>.json` (stesso elenco di `EVENTI_FILE`, copiato in `main.js` perché `tools/` non è servito) uniti in `catalogo`; `validateEvents(catalogo, data)`: se ci sono errori, `document.body.textContent = 'Eventi non validi:\n' + errori.join('\n')` e `throw new Error('catalogo non valido')`;
    - `mostraPausa`: `else if (motivo === 'evento') finestra(H.eventoHtml(V.pendingEvents(g, giocatore)[0]));`;
    - azione `scegli`: come `rispondi` (chiude la finestra, `comando({ tipo: 'scegli', evento: id, opzione: el.dataset.opzione })`, poi `pausaNecessaria` e, se serve, la finestra successiva: Review Focus 1).
  - `style.css`: `.opzione { margin: 8px 0; } .opzione button { width: 100%; text-align: left; }`.

- [ ] **Step 4: prova di fumo** — in `tools/smoke.mjs` dopo la sezione della tappa 4b:

```js
  // --- eventi e popoli dormienti (tappa 5)
  await page.evaluate(() => {
    const g = window.universalis.ui.session.game;
    g.eventi.v900 = { id: 'v900', evento: 'carestia', nazione: 'roma', altro: null, giorno: g.day };
    g.eventi.v901 = { id: 'v901', evento: 'oracolo', nazione: 'roma', altro: null, giorno: g.day };
    window.universalis.avanza(1);
  });
  check((await page.textContent('#finestra')).includes('mesi di entrate'), 'evento: finestra con gli effetti');
  await page.click('[data-azione="scegli"][data-id="v900"]');
  check(await page.evaluate(() => !window.universalis.ui.session.game.eventi.v900), 'evento scelto');
  check(await page.isVisible('[data-azione="scegli"][data-id="v901"]'), 'secondo evento subito dopo');
  await page.click('[data-azione="scegli"][data-id="v901"]');
  check(await page.isHidden('#finestra'), 'finestra chiusa dopo l\'ultimo evento');
  await page.screenshot({ path: 'smoke-eventi.png' });
```

- [ ] **Step 5: verificare** — Run: `node --test test/clock-session.test.js test/views.test.js test/panels.test.js`. Expected: PASS. `npm test` (log). Expected: verde. `npm run smoke`. Expected: nessun `FAIL`.

- [ ] **Step 6: commit** — `git commit -am "feat: finestra degli eventi, notizie di nascite e governi"`.

---

### Task 7: Bench, Jev reale, README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: bench a regole** — `node bench.js 100 10 regole > <workspace>/bench-regole.txt`; contare nel registro: popoli dormienti risvegliati (righe con difficoltà dei dormienti e `prov. inizio` 0), Roma vivo e punteggio, riepilogo per difficoltà, tempo, monarchie diventate repubbliche (voci di log `governo`, contate con un piccolo script sul bench o con una partita a regole da 300 anni) e se Roma è tra queste. Confronto con la tappa 4b (Roma 55% su 20 semi, 101 s su 10 semi). Nessuna taratura: è la tappa 6.

- [ ] **Step 2: Jev reale breve** — con `TYPESAFE_API_KEY`: `node bench.js 20 1 misto <workspace>/jev.jsonl`; contare le domande `evento`, errori e distribuzione delle scelte rispetto alla regola. Senza chiave: `Ruling:` che rimanda la misura.

- [ ] **Step 3: README** — sezione "Eventi e popoli dormienti": come arrivano gli eventi, la finestra, i risvegli (colonie greche con scelta, invasioni senza), `npm run validate-events`, come aggiungere un evento (formato e tabella degli effetti).

- [ ] **Step 4: commit** — `git commit -am "docs: README della tappa 5"`.
