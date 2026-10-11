# Universalis Romae — Tappa 1: mappa, simulazione, IA a regole — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una simulazione headless dell'Italia 753–264 a.C. con mappa reale, economia, eserciti, battaglie, assedi, guerre e paci, guidata da un'IA a regole, con un bench che fa girare partite intere.

**Architecture:** Moduli ES puri in `public/js/sim/` (nessun DOM, nessuna rete) che modificano sul posto un oggetto `game` JSON-serializzabile. Le decisioni (del giocatore, delle regole, poi di Jev) entrano solo come comandi tramite `applyCommand`. La mappa è generata una volta da `tools/build-map.js` (Natural Earth + Voronoi) in `public/data/map.json`.

**Tech Stack:** Node 24, JavaScript ES modules, `node --test`. Dipendenze solo di sviluppo per la mappa: `d3-delaunay@6.0.4`, `d3-geo@3.1.1`, `polygon-clipping@0.15.7`.

**Spec:** `docs/superpowers/specs/2026-10-12-universalis-romae-design.md`

**Esecuzione (scelta dall'utente: misto):** i task segnati *inline* li esegue la sessione principale; i task segnati *subagente* (11, 12) vanno a un subagente con revisione. Il task 11 può partire in parallelo subito dopo il task 2.

## Global Constraints

- Nessuna dipendenza a runtime: `public/` importa solo file propri.
- `public/js/sim/` non usa DOM, `fetch`, `Date`, `Math.random`: il caso passa solo da `rng.js` con lo stato in `game.rng`.
- `game` è JSON puro: `JSON.parse(JSON.stringify(game))` deve essere equivalente.
- Testi, nomi di campi e comandi in italiano, come nella spec.
- Giorno 0 = 21 aprile 753 a.C.; la partita finisce il 1 gennaio 263 a.C. (giorno 178740).
- I numeri di bilanciamento stanno in `public/data/balance.json`, mai nel codice.
- Iterazione deterministica: `Object.values` su chiavi stringa non numeriche, ordinamenti con spareggio sull'id.
- Commit alla fine di ogni task, con la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Pace firmata mentre un esercito marcia verso una provincia che diventa straniera: l'esercito si ferma, non entra (test nel task 5).
2. Capitale ceduta in pace, o nazione senza più province: nuova capitale, oppure nazione eliminata con eserciti, guerre e proposte ripuliti (test nel task 5).
3. Ordine di movimento verso una provincia irraggiungibile (nessuna guerra, nessun confine): rifiutato con motivo, stato invariato (test nel task 4).
4. Tesoro negativo e reclutamento con numeri non interi o negativi: diserzione senza `NaN`, comando rifiutato (test nei task 3 e 4).
5. Salvataggio e ricarica a metà partita: la partita ricaricata prosegue identica a quella non interrotta (test nel task 9).

## Mappa dei file

```
package.json, .gitignore, README.md
public/data/balance.json           numeri di bilanciamento
public/data/popoli.json            popoli (task 11)
public/data/map.json               generato (task 12)
public/js/sim/rng.js               generatore con seme
public/js/sim/calendar.js          date a.C./AUC
public/js/sim/state.js             helper di stato (id, province, eserciti, forza)
public/js/sim/setup.js             createGame
public/js/sim/economy.js           entrate, uomini, stabilità, infamia
public/js/sim/war.js               guerre, punteggio, pace, proposte, eliminazione
public/js/sim/armies.js            reclutamento, percorsi, movimento
public/js/sim/combat.js            battaglie, ritirate, morale
public/js/sim/siege.js             assedi
public/js/sim/commands.js          applyCommand
public/js/sim/loop.js              advanceDay
public/js/sim/score.js             punteggio e classifica
public/js/ai/rules.js              IA a regole
data/confine.json                  anello che taglia l'Italia dal resto della terra
data/centri.json                   centri delle province (task 12)
tools/fetch-ne.sh                  scarica Natural Earth in data/ne/
tools/geo.js                       funzioni pure per la mappa
tools/build-map.js                 genera map.json
tools/load-data.js                 carica i JSON reali in Node
bench.js                           partite headless
test/fixtures.js                   mappa minima di prova
test/*.test.js
```

Dipendenze tra moduli (nessun ciclo): `state` ← `war` ← `armies` ← `combat`, `siege`; `economy` ← `state`, `rng`; `commands` ← tutti; `loop` ← tutti; `rules` ← `state`, `war`, `armies`, `economy`, `calendar`.

---

### Task 1: Progetto, generatore, calendario — *inline*

**Files:**
- Create: `package.json`, `.gitignore`, `public/js/sim/rng.js`, `public/js/sim/calendar.js`
- Test: `test/rng.test.js`, `test/calendar.test.js`

**Interfaces:**
- Produces: `nextRandom(game) → number in [0,1)`, `rollD10(game) → 0..9`; `dateFromDay(n) → {year, month, day}`, `dayFromDate({year, month, day}) → n`, `auc(year)`, `formatDate(n)`, `isFirstOfMonth(n)`, `isNewYear(n)`, `END_DAY`, `MONTH_NAMES`.

- [ ] **Step 1: Crea `package.json` e `.gitignore`**

```json
{
  "name": "universalis-romae",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "node --test test/*.test.js",
    "fetch-ne": "sh tools/fetch-ne.sh",
    "build-map": "node tools/build-map.js",
    "bench": "node bench.js"
  },
  "devDependencies": {
    "d3-delaunay": "6.0.4",
    "d3-geo": "3.1.1",
    "polygon-clipping": "0.15.7"
  }
}
```

`.gitignore`:

```
node_modules/
data/ne/
bench-*.txt
```

Run: `npm install`
Expected: `added N packages`, nessun errore.

- [ ] **Step 2: Scrivi i test che falliscono**

`test/rng.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRandom, rollD10 } from '../public/js/sim/rng.js';

test('stesso seme, stessa sequenza', () => {
  const a = { rng: 42 }, b = { rng: 42 };
  const sa = Array.from({ length: 20 }, () => nextRandom(a));
  const sb = Array.from({ length: 20 }, () => nextRandom(b));
  assert.deepEqual(sa, sb);
  assert.equal(a.rng, b.rng);
});

test('valori in [0,1) e semi diversi danno sequenze diverse', () => {
  const a = { rng: 1 }, b = { rng: 2 };
  for (let i = 0; i < 1000; i++) {
    const x = nextRandom(a);
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(nextRandom({ rng: 1 }), nextRandom(b));
});

test('rollD10 copre 0..9', () => {
  const g = { rng: 7 };
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(rollD10(g));
  assert.deepEqual([...seen].sort((x, y) => x - y), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
```

`test/calendar.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateFromDay, dayFromDate, auc, formatDate, isFirstOfMonth, isNewYear, END_DAY } from '../public/js/sim/calendar.js';

test('giorno 0 è il 21 aprile 753 a.C., AUC 1', () => {
  assert.deepEqual(dateFromDay(0), { year: 753, month: 4, day: 21 });
  assert.equal(formatDate(0), '21 aprile 753 a.C. (AUC 1)');
});

test('fine anno e capodanno', () => {
  assert.deepEqual(dateFromDay(254), { year: 753, month: 12, day: 31 });
  assert.deepEqual(dateFromDay(255), { year: 752, month: 1, day: 1 });
  assert.equal(isNewYear(255), true);
  assert.equal(isNewYear(254), false);
});

test('primo del mese', () => {
  assert.equal(isFirstOfMonth(10), true); // 1 maggio 753
  assert.equal(isFirstOfMonth(11), false);
});

test('andata e ritorno', () => {
  for (const n of [0, 1, 10, 254, 255, 1000, 50000, 178739]) assert.equal(dayFromDate(dateFromDay(n)), n);
});

test('fine partita col 264 a.C.', () => {
  assert.equal(END_DAY, 178740);
  assert.deepEqual(dateFromDay(END_DAY - 1), { year: 264, month: 12, day: 31 });
  assert.equal(auc(264), 490);
});
```

- [ ] **Step 3: Verifica che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../public/js/sim/rng.js'`.

- [ ] **Step 4: Implementa**

`public/js/sim/rng.js`:

```js
// Generatore mulberry32. Lo stato è un intero a 32 bit salvato in game.rng,
// così una partita salvata riprende con la stessa sequenza.
export function nextRandom(game) {
  let t = (game.rng = (game.rng + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rollD10(game) {
  return Math.floor(nextRandom(game) * 10);
}
```

`public/js/sim/calendar.js`:

```js
// Calendario di gioco. Giorno 0 = 21 aprile 753 a.C.
// Anni di 365 giorni senza bisestili; gli anni a.C. scendono.
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const MONTH_NAMES = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const START_YEAR = 753;
const START_OFFSET = 31 + 28 + 31 + 20; // giorni dal 1 gennaio al 21 aprile

export function dateFromDay(n) {
  const total = n + START_OFFSET;
  const year = START_YEAR - Math.floor(total / 365);
  let rest = total % 365;
  let month = 0;
  while (rest >= MONTH_DAYS[month]) { rest -= MONTH_DAYS[month]; month++; }
  return { year, month: month + 1, day: rest + 1 };
}

export function dayFromDate({ year, month, day }) {
  let doy = day - 1;
  for (let m = 0; m < month - 1; m++) doy += MONTH_DAYS[m];
  return (START_YEAR - year) * 365 + doy - START_OFFSET;
}

// Anno ab urbe condita, approssimato all'anno solare: 753 a.C. = AUC 1.
export function auc(year) {
  return START_YEAR + 1 - year;
}

// La partita finisce con il 264 a.C.
export const END_DAY = dayFromDate({ year: 263, month: 1, day: 1 });

export function isFirstOfMonth(n) {
  return dateFromDay(n).day === 1;
}

export function isNewYear(n) {
  const d = dateFromDay(n);
  return d.day === 1 && d.month === 1;
}

export function formatDate(n) {
  const d = dateFromDay(n);
  return `${d.day} ${MONTH_NAMES[d.month - 1]} ${d.year} a.C. (AUC ${auc(d.year)})`;
}
```

- [ ] **Step 5: Verifica che passino**

Run: `npm test`
Expected: PASS, 8 test.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore public/js/sim/rng.js public/js/sim/calendar.js test/rng.test.js test/calendar.test.js
git commit -m "feat: generatore con seme e calendario a.C./AUC"
```

---

### Task 2: Bilanciamento, stato, creazione partita — *inline*

**Files:**
- Create: `public/data/balance.json`, `public/js/sim/state.js`, `public/js/sim/setup.js`, `test/fixtures.js`
- Test: `test/setup.test.js`

**Interfaces:**
- Consumes: niente.
- Produces:
  - `state.js`: `newId(game, prefix) → string`, `strettoKey(a, b) → 'a|b'` (ordinata), `provincesOf(game, nationId) → Province[]` (possedute), `sumOf(list, field) → number`, `clamp(x, lo, hi)`, `maxManpower(game, nationId) → number`, `armiesOf(game, nationId) → Army[]`, `createArmy(game, owner, prov, fanteria, cavalleria) → Army`, `armyStrength(game, army) → number`, `bordersNation(game, a, b) → bool`, `log(game, entry)`.
  - `setup.js`: `createGame({ map, popoli, balance, seed }) → game`.
  - `test/fixtures.js`: `fixtureMap`, `fixturePopoli`, `balance`, `makeGame(seed = 1) → game`.
  - Forma di `game` (documentata in testa a `setup.js`, usata da tutti i task successivi).
  - Forma di `map.json` in ingresso: `{ width, height, province: [{ id, nome, terreno, tasse, uomini, fort, cultura, owner, centro: [x, y], poligoni, vicini: [id] }], stretti: [[a, b]], decorazioni: [{ tipo, poligoni }] }`. `createGame` legge solo `province` e `stretti`.
  - Forma di `popoli.json`: `{ popoli: [{ id, nome, colore, cultura, governo, capitale, difficolta, tratti, carattere, dormiente? }] }`.

- [ ] **Step 1: Crea `public/data/balance.json`**

```json
{
  "economia": { "tasseMese": 0.1, "stabilitaEntrate": 0.05, "uominiMese": 25, "uominiMax": 500, "mantenimento1000": 0.2, "diserzioneDebito": 0.05 },
  "inizio": { "fanteriaPerUomo": 300, "cavalleriaPerUomo": 30, "tesoroMesi": 6, "riservaQuota": 0.5 },
  "costi": { "fanteria1000": 2, "cavalleria1000": 5, "stabilitaBase": 10, "stabilitaPerTassa": 2 },
  "stabilita": { "derivaAnno": 0.2 },
  "infamia": { "soglia": 20, "caloAnno": 1, "perProvincia": 2, "culturaDiversa": 2 },
  "movimento": { "giorni": { "pianura": 8, "collina": 10, "montagna": 14, "palude": 14 }, "stretto": 6 },
  "combattimento": {
    "perdite": 0.004, "morale": 0.04, "moraleMax": 3, "recuperoMorale": 0.05, "minimoUomini": 100,
    "cavalleria": { "pianura": 1.5, "collina": 1.0, "montagna": 0.75, "palude": 0.75 },
    "terreno": { "pianura": 0, "collina": 1, "montagna": 2, "palude": 1 }
  },
  "assedio": { "base": 0.02, "massimo": 0.2 },
  "guerra": { "senzaPretesto": 2, "tregua": 1825, "puntiBattaglia": 2, "maxBattaglie": 25, "scadenzaProposta": 30 },
  "punteggio": { "culturaPropria": 1 },
  "ia": { "rapportoGuerra": 1.5, "pacePunteggio": 30, "resaPunteggio": -60, "paceBiancaAnni": 3, "reclutaSoglia": 1000, "riservaTesoro": 2, "esercitoObiettivo": 0.8 }
}
```

- [ ] **Step 2: Crea la mappa di prova `test/fixtures.js`**

```js
// Mappa minima per i test:
//   a(roma) - b(roma) - c(volsci)
//     |         |         |
//   d(latini)- e(latini)- f(volsci) ~stretto~ g(siculi)
import { readFileSync } from 'node:fs';
import { createGame } from '../public/js/sim/setup.js';

export const balance = JSON.parse(readFileSync(new URL('../public/data/balance.json', import.meta.url)));

const P = (id, owner, cultura, terreno, tasse, uomini, fort, vicini) =>
  ({ id, nome: id.toUpperCase(), owner, cultura, terreno, tasse, uomini, fort, centro: [0, 0], poligoni: [], vicini });

export const fixtureMap = {
  width: 100, height: 100,
  province: [
    P('a', 'roma', 'latina', 'pianura', 4, 4, 1, ['b', 'd']),
    P('b', 'roma', 'latina', 'collina', 2, 2, 0, ['a', 'c', 'e']),
    P('c', 'volsci', 'volsca', 'montagna', 1, 2, 0, ['b', 'f']),
    P('d', 'latini', 'latina', 'pianura', 3, 2, 0, ['a', 'e']),
    P('e', 'latini', 'latina', 'collina', 2, 2, 1, ['d', 'b', 'f']),
    P('f', 'volsci', 'volsca', 'montagna', 1, 1, 0, ['e', 'c', 'g']),
    P('g', 'siculi', 'sicula', 'pianura', 2, 2, 0, ['f'])
  ],
  stretti: [['f', 'g']],
  decorazioni: []
};

const N = (id, cultura, capitale, tratti = {}, extra = {}) =>
  ({ id, nome: id, colore: '#888888', cultura, governo: 'tribù', capitale, difficolta: 'normale', tratti, carattere: '', ...extra });

export const fixturePopoli = {
  popoli: [
    N('roma', 'latina', 'a', { reclute: 0.3 }),
    N('latini', 'latina', 'd'),
    N('volsci', 'volsca', 'c', { montagna: 1 }),
    N('siculi', 'sicula', 'g'),
    N('taranto', 'greca', 'g', {}, { dormiente: true })
  ]
};

export function makeGame(seed = 1) {
  return createGame({ map: fixtureMap, popoli: fixturePopoli, balance, seed });
}
```

- [ ] **Step 3: Scrivi il test che fallisce `test/setup.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf, maxManpower } from '../public/js/sim/state.js';

test('ogni popolo attivo parte con un esercito nella capitale', () => {
  const g = makeGame();
  assert.deepEqual(g.ordine, ['roma', 'latini', 'volsci', 'siculi']);
  const [r] = armiesOf(g, 'roma');
  assert.equal(r.prov, 'a');
  assert.equal(r.fanteria, 2340); // (4+2) * 300 * 1.3
  assert.equal(r.cavalleria, 234);
  assert.equal(r.morale, 3);
});

test('i popoli dormienti non entrano in partita', () => {
  assert.equal(makeGame().nazioni.taranto, undefined);
});

test('tesoro, uomini e controllo iniziali', () => {
  const g = makeGame();
  assert.ok(Math.abs(g.nazioni.roma.tesoro - 3.6) < 1e-9); // 6 * 0.1 * 6
  assert.equal(maxManpower(g, 'roma'), 3900); // 6 * 500 * 1.3
  assert.equal(g.nazioni.roma.uomini, 1950);
  for (const p of Object.values(g.province)) assert.equal(p.controller, p.owner);
  assert.deepEqual(g.stretti, ['f|g']);
});

test('lo stato è JSON puro', () => {
  const g = makeGame();
  assert.deepEqual(JSON.parse(JSON.stringify(g)), g);
});
```

- [ ] **Step 4: Verifica che fallisca**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../public/js/sim/setup.js'`.

- [ ] **Step 5: Implementa `state.js` e `setup.js`**

`public/js/sim/state.js`:

```js
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

export function maxManpower(game, nationId) {
  const n = game.nazioni[nationId];
  return Math.round(sumOf(provincesOf(game, nationId), 'uomini') * game.balance.economia.uominiMax * (1 + (n.tratti.reclute || 0)));
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
```

`public/js/sim/setup.js`:

```js
// Stato di una partita. La simulazione lo modifica sul posto; è JSON puro, quindi si salva
// con JSON.stringify e si ricarica con JSON.parse.
// game = {
//   day, rng, nextId, balance,
//   province: { [id]: { id, nome, owner, controller, cultura, terreno, tasse, uomini, fort, vicini: [id] } },
//   stretti: ['a|b'],
//   nazioni: { [id]: { id, nome, colore, cultura, governo, capitale, tesoro, uomini, stabilita, infamia,
//                      tratti, vivo, tregue: { [id]: giornoFine } } },
//   ordine: [id],                 // ordine stabile delle nazioni attive (quello di popoli.json)
//   eserciti: { [id]: { id, owner, prov, fanteria, cavalleria, morale, percorso: [id], giorniAlProssimo, inBattaglia } },
//   guerre: { [id]: { id, attaccanti: [id], difensori: [id], inizio, battaglie } },
//   proposte: { [id]: { id, tipo: 'pace', guerra, da, a, termini: { ricevente, province: [id] }, giorno } },
//   log: [{ day, tipo, ... }]     // eventi del giorno corrente
// }
import { createArmy, provincesOf, sumOf, strettoKey, maxManpower } from './state.js';

export function createGame({ map, popoli, balance, seed }) {
  const game = {
    day: 0, rng: seed >>> 0, nextId: 1, balance,
    province: {}, stretti: [], nazioni: {}, ordine: [],
    eserciti: {}, guerre: {}, proposte: {}, log: []
  };
  for (const p of map.province) {
    game.province[p.id] = {
      id: p.id, nome: p.nome, owner: p.owner, controller: p.owner, cultura: p.cultura,
      terreno: p.terreno, tasse: p.tasse, uomini: p.uomini, fort: p.fort, vicini: [...p.vicini]
    };
  }
  game.stretti = (map.stretti || []).map(([a, b]) => strettoKey(a, b));
  for (const n of popoli.popoli) {
    if (n.dormiente) continue;
    game.ordine.push(n.id);
    game.nazioni[n.id] = {
      id: n.id, nome: n.nome, colore: n.colore, cultura: n.cultura, governo: n.governo,
      capitale: n.capitale, tesoro: 0, uomini: 0, stabilita: 0, infamia: 0,
      tratti: { ...n.tratti }, vivo: true, tregue: {}
    };
  }
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    const owned = provincesOf(game, id);
    const bonus = 1 + (n.tratti.reclute || 0);
    const uomini = sumOf(owned, 'uomini');
    n.tesoro = sumOf(owned, 'tasse') * balance.economia.tasseMese * balance.inizio.tesoroMesi;
    n.uomini = Math.round(maxManpower(game, id) * balance.inizio.riservaQuota);
    createArmy(game, id, n.capitale,
      Math.round(uomini * balance.inizio.fanteriaPerUomo * bonus),
      Math.round(uomini * balance.inizio.cavalleriaPerUomo * bonus));
  }
  return game;
}
```

- [ ] **Step 6: Verifica che passino**

Run: `npm test`
Expected: PASS, 12 test.

- [ ] **Step 7: Commit**

```bash
git add public/data/balance.json public/js/sim/state.js public/js/sim/setup.js test/fixtures.js test/setup.test.js
git commit -m "feat: stato di gioco, bilanciamento e creazione partita"
```

---

### Task 3: Economia, stabilità, infamia — *inline*

**Files:**
- Create: `public/js/sim/economy.js`
- Test: `test/economy.test.js`

**Interfaces:**
- Consumes: `provincesOf`, `sumOf`, `armiesOf`, `maxManpower` da `state.js`; `nextRandom` da `rng.js`.
- Produces: `monthlyIncome(game, id)`, `monthlyUpkeep(game, id)`, `monthlyEconomy(game)`, `yearlyUpdate(game)`, `stabilityCost(game, id)`, `raiseStability(game, id) → { ok, motivo? }`.

- [ ] **Step 1: Scrivi i test che falliscono**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { monthlyIncome, monthlyUpkeep, monthlyEconomy, yearlyUpdate, stabilityCost, raiseStability } from '../public/js/sim/economy.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('entrate: solo province controllate, modificate dalla stabilità', () => {
  const g = makeGame();
  close(monthlyIncome(g, 'roma'), 0.6);
  g.nazioni.roma.stabilita = 3;
  close(monthlyIncome(g, 'roma'), 0.6 * 1.15);
  g.nazioni.roma.stabilita = 0;
  g.province.b.controller = 'volsci';
  close(monthlyIncome(g, 'roma'), 0.4);
});

test('mantenimento: la cavalleria costa il doppio', () => {
  const g = makeGame();
  close(monthlyUpkeep(g, 'roma'), (2340 + 234 * 2) / 1000 * 0.2);
});

test('mese: tesoro e uomini salgono, uomini con tetto', () => {
  const g = makeGame();
  const t0 = g.nazioni.roma.tesoro;
  monthlyEconomy(g);
  close(g.nazioni.roma.tesoro, t0 + monthlyIncome(g, 'roma') - monthlyUpkeep(g, 'roma'));
  assert.equal(g.nazioni.roma.uomini, 1950 + Math.round(6 * 25 * 1.3));
  g.nazioni.roma.uomini = 3899;
  monthlyEconomy(g);
  assert.equal(g.nazioni.roma.uomini, 3900);
});

test('debito: gli eserciti disertano, senza NaN', () => {
  const g = makeGame();
  g.nazioni.roma.tesoro = -50;
  monthlyEconomy(g);
  const a = Object.values(g.eserciti).find(x => x.owner === 'roma');
  assert.equal(a.fanteria, Math.floor(2340 * 0.95));
  assert.ok(Number.isFinite(g.nazioni.roma.tesoro));
});

test('anno: infamia cala fino a 0, stabilità negativa risale', () => {
  const g = makeGame();
  g.nazioni.roma.infamia = 1.5;
  g.nazioni.roma.stabilita = -3;
  for (let i = 0; i < 60; i++) yearlyUpdate(g);
  assert.equal(g.nazioni.roma.infamia, 0);
  assert.ok(g.nazioni.roma.stabilita > -3);
});

test('alzare la stabilità costa e ha un tetto', () => {
  const g = makeGame();
  assert.equal(stabilityCost(g, 'roma'), 10 + 2 * 6);
  assert.equal(raiseStability(g, 'roma').ok, false); // 3.6 < 22
  g.nazioni.roma.tesoro = 100;
  assert.equal(raiseStability(g, 'roma').ok, true);
  close(g.nazioni.roma.tesoro, 78);
  g.nazioni.roma.stabilita = 3;
  assert.deepEqual(raiseStability(g, 'roma'), { ok: false, motivo: 'stabilità al massimo' });
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../economy.js'`.

- [ ] **Step 3: Implementa `public/js/sim/economy.js`**

```js
// Economia mensile e aggiornamenti annuali.
import { provincesOf, sumOf, armiesOf, maxManpower } from './state.js';
import { nextRandom } from './rng.js';

function paying(game, id) {
  return provincesOf(game, id).filter(p => p.controller === id);
}

export function monthlyIncome(game, id) {
  const n = game.nazioni[id], b = game.balance.economia;
  return sumOf(paying(game, id), 'tasse') * b.tasseMese * (1 + n.stabilita * b.stabilitaEntrate);
}

export function monthlyUpkeep(game, id) {
  const men = armiesOf(game, id).reduce((s, a) => s + (a.fanteria + a.cavalleria * 2) / 1000, 0);
  return men * game.balance.economia.mantenimento1000;
}

export function monthlyEconomy(game) {
  const b = game.balance.economia;
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    if (!n.vivo) continue;
    n.tesoro += monthlyIncome(game, id) - monthlyUpkeep(game, id);
    const regen = Math.round(sumOf(paying(game, id), 'uomini') * b.uominiMese * (1 + (n.tratti.reclute || 0)));
    n.uomini = Math.min(maxManpower(game, id), n.uomini + regen);
    if (n.tesoro < 0) {
      for (const a of armiesOf(game, id)) {
        a.fanteria = Math.floor(a.fanteria * (1 - b.diserzioneDebito));
        a.cavalleria = Math.floor(a.cavalleria * (1 - b.diserzioneDebito));
      }
    }
  }
}

// La stabilità tende a 0: risale più in fretta e scende più piano con il tratto "stabilita".
export function yearlyUpdate(game) {
  const b = game.balance;
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    if (!n.vivo) continue;
    const t = n.tratti.stabilita || 0;
    if (n.stabilita < 0 && nextRandom(game) < b.stabilita.derivaAnno * (1 + t)) n.stabilita += 1;
    else if (n.stabilita > 0 && nextRandom(game) < b.stabilita.derivaAnno * Math.max(0, 1 - t)) n.stabilita -= 1;
    n.infamia = Math.max(0, n.infamia - b.infamia.caloAnno);
  }
}

export function stabilityCost(game, id) {
  const c = game.balance.costi;
  return c.stabilitaBase + c.stabilitaPerTassa * sumOf(provincesOf(game, id), 'tasse');
}

export function raiseStability(game, id) {
  const n = game.nazioni[id];
  if (!n?.vivo) return { ok: false, motivo: 'nazione inesistente' };
  if (n.stabilita >= 3) return { ok: false, motivo: 'stabilità al massimo' };
  const cost = stabilityCost(game, id);
  if (n.tesoro < cost) return { ok: false, motivo: 'denaro insufficiente' };
  n.tesoro -= cost;
  n.stabilita += 1;
  return { ok: true };
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 18 test.

- [ ] **Step 5: Commit**

```bash
git add public/js/sim/economy.js test/economy.test.js
git commit -m "feat: economia mensile, stabilità e infamia"
```

---

### Task 4: Guerre (base) ed eserciti: reclutamento, percorsi, movimento — *inline*

Il movimento dipende da `atWar`, quindi questo task crea anche il nucleo di `war.js`. Pace e proposte arrivano nel task 5.

**Files:**
- Create: `public/js/sim/war.js` (prima parte), `public/js/sim/armies.js`
- Test: `test/armies.test.js`

**Interfaces:**
- Consumes: `state.js`.
- Produces:
  - `war.js`: `sideOf(war, id) → 'attaccanti'|'difensori'|null`, `enemiesOf(war, side) → [id]`, `warBetween(game, a, b) → War|null`, `atWar(game, a, b) → bool`, `hasPretext(game, attacker, defender)`, `inTruce(game, a, b)`, `declareWar(game, attacker, defender) → { ok, motivo?, guerra? }`.
  - `armies.js`: `travelDays(game, from, to)`, `canEnter(game, nationId, provId)`, `distancesFrom(game, nationId, from) → { dist: {id: giorni}, prev: {id: id} }`, `findPath(game, nationId, from, to) → [id] | null`, `orderMove(game, armyId, to) → { ok, motivo? }`, `advanceMovement(game)`, `recruit(game, nationId, provId, fanteria, cavalleria) → { ok, motivo?, esercito? }`.

- [ ] **Step 1: Scrivi i test che falliscono `test/armies.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf } from '../public/js/sim/state.js';
import { declareWar, atWar } from '../public/js/sim/war.js';
import { travelDays, findPath, orderMove, advanceMovement, recruit } from '../public/js/sim/armies.js';

test('dichiarare guerra: regole e costo senza pretesto', () => {
  const g = makeGame();
  assert.equal(declareWar(g, 'roma', 'siculi').motivo, 'nessun confine');
  assert.equal(declareWar(g, 'roma', 'volsci').ok, true);
  assert.equal(g.nazioni.roma.stabilita, -2);
  assert.equal(atWar(g, 'volsci', 'roma'), true);
  assert.equal(atWar(g, 'roma', 'latini'), false);
  assert.equal(declareWar(g, 'roma', 'volsci').motivo, 'già in guerra');
  g.nazioni.latini.tregue.roma = g.day + 10;
  assert.equal(declareWar(g, 'latini', 'roma').motivo, 'tregua in corso');
});

test('con pretesto (infamia del nemico sopra soglia) non si perde stabilità', () => {
  const g = makeGame();
  g.nazioni.volsci.infamia = 25;
  declareWar(g, 'roma', 'volsci');
  assert.equal(g.nazioni.roma.stabilita, 0);
});

test('giorni di viaggio: terreno di arrivo più stretto', () => {
  const g = makeGame();
  assert.equal(travelDays(g, 'a', 'b'), 10);
  assert.equal(travelDays(g, 'f', 'g'), 8 + 6);
});

test('percorsi: territorio straniero solo in guerra', () => {
  const g = makeGame();
  assert.equal(findPath(g, 'roma', 'a', 'c'), null);
  declareWar(g, 'roma', 'volsci');
  assert.deepEqual(findPath(g, 'roma', 'a', 'c'), ['b', 'c']);
  assert.deepEqual(findPath(g, 'roma', 'a', 'a'), []);
});

test('ordine verso provincia irraggiungibile: rifiutato, stato invariato', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  const before = JSON.stringify(g);
  assert.deepEqual(orderMove(g, r.id, 'c'), { ok: false, motivo: 'nessun percorso' });
  assert.equal(JSON.stringify(g), before);
});

test('movimento: arriva dopo i giorni del terreno', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  assert.equal(orderMove(g, r.id, 'b').ok, true);
  for (let i = 0; i < 9; i++) advanceMovement(g);
  assert.equal(r.prov, 'a');
  advanceMovement(g);
  assert.equal(r.prov, 'b');
  assert.deepEqual(r.percorso, []);
});

test('reclutamento: costi, unione con esercito fermo, errori', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  const res = recruit(g, 'roma', 'a', 1000, 0);
  assert.equal(res.ok, true);
  assert.equal(res.esercito, r.id);
  assert.equal(r.fanteria, 3340);
  assert.equal(g.nazioni.roma.uomini, 950);
  assert.equal(recruit(g, 'roma', 'a', 1000, 0).motivo, 'denaro insufficiente');
  assert.equal(recruit(g, 'roma', 'c', 100, 0).motivo, 'provincia non tua');
  assert.equal(recruit(g, 'roma', 'a', -5, 0).motivo, 'numeri non validi');
  assert.equal(recruit(g, 'roma', 'a', 10.5, 0).motivo, 'numeri non validi');
  g.nazioni.roma.tesoro = 100;
  assert.equal(recruit(g, 'roma', 'b', 500, 0).ok, true);
  assert.equal(armiesOf(g, 'roma').length, 2);
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../war.js'`.

- [ ] **Step 3: Implementa `public/js/sim/war.js` (prima parte)**

```js
// Guerre: dichiarazione, lati, tregue. Punteggio, pace e proposte sotto.
import { newId, log, bordersNation } from './state.js';

export function sideOf(war, id) {
  if (war.attaccanti.includes(id)) return 'attaccanti';
  if (war.difensori.includes(id)) return 'difensori';
  return null;
}

export function enemiesOf(war, side) {
  return side === 'attaccanti' ? war.difensori : war.attaccanti;
}

export function warBetween(game, a, b) {
  return Object.values(game.guerre).find(w => {
    const sa = sideOf(w, a), sb = sideOf(w, b);
    return sa && sb && sa !== sb;
  }) || null;
}

export function atWar(game, a, b) {
  return a !== b && warBetween(game, a, b) !== null;
}

export function hasPretext(game, attacker, defender) {
  return game.nazioni[defender].infamia > game.balance.infamia.soglia;
}

export function inTruce(game, a, b) {
  return (game.nazioni[a].tregue[b] ?? -1) > game.day;
}

export function declareWar(game, attacker, defender) {
  const A = game.nazioni[attacker], D = game.nazioni[defender];
  if (!A?.vivo || !D?.vivo || attacker === defender) return { ok: false, motivo: 'nazione non valida' };
  if (atWar(game, attacker, defender)) return { ok: false, motivo: 'già in guerra' };
  if (inTruce(game, attacker, defender)) return { ok: false, motivo: 'tregua in corso' };
  if (!bordersNation(game, attacker, defender)) return { ok: false, motivo: 'nessun confine' };
  if (!hasPretext(game, attacker, defender)) A.stabilita = Math.max(-3, A.stabilita - game.balance.guerra.senzaPretesto);
  const id = newId(game, 'g');
  game.guerre[id] = { id, attaccanti: [attacker], difensori: [defender], inizio: game.day, battaglie: 0 };
  log(game, { tipo: 'guerra', guerra: id, attaccante: attacker, difensore: defender });
  return { ok: true, guerra: id };
}
```

- [ ] **Step 4: Implementa `public/js/sim/armies.js`**

```js
// Eserciti: reclutamento, percorsi e movimento giornaliero.
import { createArmy, strettoKey } from './state.js';
import { atWar } from './war.js';

export function travelDays(game, from, to) {
  const b = game.balance.movimento;
  return b.giorni[game.province[to].terreno] + (game.stretti.includes(strettoKey(from, to)) ? b.stretto : 0);
}

// Si entra in casa propria, dove si controlla, o nelle terre di chi è in guerra con noi.
export function canEnter(game, nationId, provId) {
  const p = game.province[provId];
  return p.owner === nationId || p.controller === nationId || atWar(game, nationId, p.owner);
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
```

- [ ] **Step 5: Verifica che passino**

Run: `npm test`
Expected: PASS, 25 test.

- [ ] **Step 6: Commit**

```bash
git add public/js/sim/war.js public/js/sim/armies.js test/armies.test.js
git commit -m "feat: dichiarazione di guerra, reclutamento e movimento degli eserciti"
```

---

### Task 5: Punteggio di guerra, pace, proposte, eliminazione — *inline*

**Files:**
- Modify: `public/js/sim/war.js` (aggiunte in fondo; import esteso)
- Test: `test/war.test.js`

**Interfaces:**
- Consumes: `canEnter` non serve; usa `state.js`.
- Produces: `warscore(game, war) → -100..100` (lato attaccanti), `scoreFor(game, war, nationId)`, `peaceCost(game, war, receiver, termini)`, `validTerms(game, war, receiver, termini) → string|null`, `makePeace(game, warId, receiver, { province }) → { ok, motivo? }`, `checkSurvival(game)`, `proposePeace(game, from, warId, { ricevente, province }) → { ok, motivo?, proposta? }`, `answerProposal(game, nationId, propId, accetta) → { ok, accettata?, motivo? }`, `expireProposals(game)`.

- [ ] **Step 1: Scrivi i test che falliscono `test/war.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf } from '../public/js/sim/state.js';
import { orderMove, advanceMovement } from '../public/js/sim/armies.js';
import {
  declareWar, warscore, scoreFor, peaceCost, makePeace, proposePeace, answerProposal, expireProposals, atWar
} from '../public/js/sim/war.js';

function warGame() {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  return { g, w: g.guerre[guerra] };
}

test('punteggio: occupazione pesata sulle tasse più battaglie', () => {
  const { g, w } = warGame();
  assert.equal(warscore(g, w), 0);
  g.province.c.controller = 'roma';
  assert.equal(warscore(g, w), 50);
  w.battaglie = 10;
  assert.equal(warscore(g, w), 60);
  assert.equal(scoreFor(g, w, 'volsci'), -60);
  assert.equal(peaceCost(g, w, 'roma', { province: ['c'] }), 50);
});

test('pace: province, infamia, tregua, nuova capitale', () => {
  const { g, w } = warGame();
  g.province.c.controller = 'roma';
  assert.equal(makePeace(g, w.id, 'roma', { province: ['f'] }).motivo, 'provincia non occupata');
  assert.equal(makePeace(g, w.id, 'roma', { province: ['c'] }).ok, true);
  assert.equal(g.province.c.owner, 'roma');
  assert.equal(g.nazioni.roma.infamia, 4); // 2 + 2 cultura diversa
  assert.equal(g.nazioni.volsci.capitale, 'f');
  assert.equal(g.nazioni.roma.tregue.volsci, g.day + 1825);
  assert.equal(g.nazioni.volsci.tregue.roma, g.day + 1825);
  assert.equal(atWar(g, 'roma', 'volsci'), false);
  assert.deepEqual(g.guerre, {});
});

test('pace: occupazioni restituite ed eserciti rimandati a casa', () => {
  const { g, w } = warGame();
  g.province.b.controller = 'volsci';
  const [v] = armiesOf(g, 'volsci');
  v.prov = 'b';
  makePeace(g, w.id, 'roma', { province: [] });
  assert.equal(g.province.b.controller, 'roma');
  assert.equal(v.prov, 'c');
});

test('pace durante una marcia: l\'esercito non entra in terra ora straniera', () => {
  const { g, w } = warGame();
  const [r] = armiesOf(g, 'roma');
  r.prov = 'b';
  assert.equal(orderMove(g, r.id, 'c').ok, true);
  makePeace(g, w.id, 'roma', { province: [] });
  for (let i = 0; i < 20; i++) advanceMovement(g);
  assert.equal(r.prov, 'b');
  assert.deepEqual(r.percorso, []);
});

test('una nazione senza province viene eliminata e ripulita', () => {
  const { g, w } = warGame();
  g.province.c.controller = 'roma';
  g.province.f.controller = 'roma';
  proposePeace(g, 'volsci', w.id, { ricevente: 'volsci', province: [] });
  makePeace(g, w.id, 'roma', { province: ['c', 'f'] });
  assert.equal(g.nazioni.volsci.vivo, false);
  assert.equal(armiesOf(g, 'volsci').length, 0);
  assert.deepEqual(g.proposte, {});
});

test('proposte: proporre, rifiutare, accettare, scadere', () => {
  const { g, w } = warGame();
  g.province.c.controller = 'roma';
  assert.equal(proposePeace(g, 'roma', w.id, { ricevente: 'latini', province: [] }).motivo, 'ricevente non valido');
  const p1 = proposePeace(g, 'roma', w.id, { ricevente: 'roma', province: ['c'] }).proposta;
  assert.equal(g.proposte[p1].a, 'volsci');
  assert.equal(answerProposal(g, 'roma', p1, true).motivo, 'proposta inesistente'); // non è rivolta a roma
  assert.deepEqual(answerProposal(g, 'volsci', p1, false), { ok: true, accettata: false });
  const p2 = proposePeace(g, 'roma', w.id, { ricevente: 'roma', province: ['c'] }).proposta;
  g.day += 31;
  expireProposals(g);
  assert.equal(g.proposte[p2], undefined);
  const p3 = proposePeace(g, 'roma', w.id, { ricevente: 'roma', province: ['c'] }).proposta;
  assert.deepEqual(answerProposal(g, 'volsci', p3, true), { ok: true, accettata: true });
  assert.equal(g.province.c.owner, 'roma');
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL, `does not provide an export named 'warscore'`.

- [ ] **Step 3: Implementa (aggiunte a `war.js`)**

Cambia l'import in testa:

```js
import { newId, log, bordersNation, provincesOf, sumOf } from './state.js';
```

Aggiungi in fondo:

```js
// Quota (0-100) del valore delle province di un lato occupata dall'altro lato.
function occupation(game, war, side) {
  const owners = war[side], enemies = enemiesOf(war, side);
  const owned = Object.values(game.province).filter(p => owners.includes(p.owner));
  const total = sumOf(owned, 'tasse');
  if (total === 0) return 100;
  return 100 * sumOf(owned.filter(p => enemies.includes(p.controller)), 'tasse') / total;
}

// Punteggio dal punto di vista degli attaccanti.
export function warscore(game, war) {
  const s = occupation(game, war, 'difensori') - occupation(game, war, 'attaccanti') + war.battaglie;
  return Math.max(-100, Math.min(100, s));
}

export function scoreFor(game, war, nationId) {
  const s = warscore(game, war);
  return sideOf(war, nationId) === 'attaccanti' ? s : -s;
}

// Costo in punteggio delle province chieste da `receiver`.
export function peaceCost(game, war, receiver, termini) {
  const losers = enemiesOf(war, sideOf(war, receiver));
  const total = sumOf(Object.values(game.province).filter(p => losers.includes(p.owner)), 'tasse');
  return termini.province.reduce((s, id) => s + 100 * game.province[id].tasse / total, 0);
}

export function validTerms(game, war, receiver, termini) {
  const side = sideOf(war, receiver);
  if (!side) return 'non partecipa';
  const mine = war[side], losers = enemiesOf(war, side);
  for (const id of termini.province) {
    const p = game.province[id];
    if (!p) return 'provincia inesistente';
    if (!losers.includes(p.owner)) return 'provincia non del nemico';
    if (!mine.includes(p.controller)) return 'provincia non occupata';
  }
  return null;
}

export function makePeace(game, warId, receiver, termini) {
  const war = game.guerre[warId];
  if (!war) return { ok: false, motivo: 'guerra inesistente' };
  const err = validTerms(game, war, receiver, termini);
  if (err) return { ok: false, motivo: err };
  const R = game.nazioni[receiver], inf = game.balance.infamia;
  for (const id of termini.province) {
    const p = game.province[id];
    R.infamia += inf.perProvincia + (p.cultura !== R.cultura ? inf.culturaDiversa : 0);
    p.owner = receiver;
    p.controller = receiver;
  }
  const parti = [...war.attaccanti, ...war.difensori];
  for (const p of Object.values(game.province)) {
    if (p.controller !== p.owner && parti.includes(p.owner) && parti.includes(p.controller)) p.controller = p.owner;
  }
  const fine = game.day + game.balance.guerra.tregua;
  for (const a of war.attaccanti) for (const d of war.difensori) {
    game.nazioni[a].tregue[d] = fine;
    game.nazioni[d].tregue[a] = fine;
  }
  delete game.guerre[warId];
  for (const p of Object.values(game.proposte)) if (p.guerra === warId) delete game.proposte[p.id];
  checkSurvival(game);
  // eserciti rimasti in terra ora straniera tornano nella capitale
  for (const a of Object.values(game.eserciti)) {
    const p = game.province[a.prov];
    if (p.owner !== a.owner && p.controller !== a.owner && !atWar(game, a.owner, p.owner)) {
      a.prov = game.nazioni[a.owner].capitale;
      a.percorso = [];
    }
  }
  log(game, { tipo: 'pace', guerra: warId, ricevente: receiver, province: [...termini.province] });
  return { ok: true };
}

// Capitale persa: passa alla provincia più ricca. Nessuna provincia: nazione eliminata.
export function checkSurvival(game) {
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    if (!n.vivo) continue;
    const owned = provincesOf(game, id);
    if (owned.length === 0) { eliminate(game, id); continue; }
    if (game.province[n.capitale].owner !== id) {
      n.capitale = owned.reduce((best, p) => (p.tasse > best.tasse || (p.tasse === best.tasse && p.id < best.id) ? p : best)).id;
    }
  }
}

function eliminate(game, id) {
  game.nazioni[id].vivo = false;
  for (const a of Object.values(game.eserciti)) if (a.owner === id) delete game.eserciti[a.id];
  for (const w of Object.values(game.guerre)) {
    w.attaccanti = w.attaccanti.filter(x => x !== id);
    w.difensori = w.difensori.filter(x => x !== id);
    if (!w.attaccanti.length || !w.difensori.length) delete game.guerre[w.id];
  }
  for (const p of Object.values(game.province)) if (p.controller === id) p.controller = p.owner;
  for (const pr of Object.values(game.proposte)) {
    if (pr.da === id || pr.a === id || !game.guerre[pr.guerra]) delete game.proposte[pr.id];
  }
  log(game, { tipo: 'eliminata', nazione: id });
}

export function proposePeace(game, from, warId, termini) {
  const war = game.guerre[warId];
  if (!war) return { ok: false, motivo: 'guerra inesistente' };
  const side = sideOf(war, from);
  if (!side) return { ok: false, motivo: 'non partecipa' };
  const to = enemiesOf(war, side)[0];
  if (termini.ricevente !== from && termini.ricevente !== to) return { ok: false, motivo: 'ricevente non valido' };
  const err = validTerms(game, war, termini.ricevente, termini);
  if (err) return { ok: false, motivo: err };
  const id = newId(game, 'p');
  game.proposte[id] = {
    id, tipo: 'pace', guerra: warId, da: from, a: to,
    termini: { ricevente: termini.ricevente, province: [...termini.province] }, giorno: game.day
  };
  log(game, { tipo: 'proposta', proposta: id, da: from, a: to });
  return { ok: true, proposta: id };
}

export function answerProposal(game, nationId, propId, accetta) {
  const p = game.proposte[propId];
  if (!p || p.a !== nationId) return { ok: false, motivo: 'proposta inesistente' };
  delete game.proposte[propId];
  if (!accetta) {
    log(game, { tipo: 'rifiutata', proposta: propId, da: p.da, a: p.a });
    return { ok: true, accettata: false };
  }
  const r = makePeace(game, p.guerra, p.termini.ricevente, { province: p.termini.province });
  return r.ok ? { ok: true, accettata: true } : r;
}

export function expireProposals(game) {
  for (const p of Object.values(game.proposte)) {
    if (game.day - p.giorno > game.balance.guerra.scadenzaProposta) delete game.proposte[p.id];
  }
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 31 test.

- [ ] **Step 5: Commit**

```bash
git add public/js/sim/war.js test/war.test.js
git commit -m "feat: punteggio di guerra, pace, proposte ed eliminazione"
```

---

### Task 6: Battaglie, ritirate, morale — *inline*

**Files:**
- Create: `public/js/sim/combat.js`
- Test: `test/combat.test.js`

**Interfaces:**
- Consumes: `rollD10`; `armyStrength`, `clamp`, `log` da `state.js`; `atWar`, `warBetween`, `sideOf` da `war.js`.
- Produces: `resolveBattles(game)` (azzera e imposta `inBattaglia`), `battleDay(game, provId, sideA, sideB) → vincitore|null`, `retreat(game, army)`, `recoverMorale(game)`.
- Il tratto `battaglia` (intero) si somma al dado sempre; il tratto `montagna` solo su terreno montagna; il bonus terreno va a chi controlla la provincia.

- [ ] **Step 1: Scrivi i test che falliscono `test/combat.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf, createArmy } from '../public/js/sim/state.js';
import { declareWar } from '../public/js/sim/war.js';
import { resolveBattles, recoverMorale } from '../public/js/sim/combat.js';

function setup(seed = 1) {
  const g = makeGame(seed);
  const { guerra } = declareWar(g, 'roma', 'volsci');
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  return { g, w: g.guerre[guerra] };
}

function fight(g, max = 100) {
  for (let i = 0; i < max; i++) {
    resolveBattles(g);
    if (g.log.some(e => e.tipo === 'battaglia')) return g.log.find(e => e.tipo === 'battaglia');
  }
  return null;
}

test('il più forte vince e conta per il punteggio', () => {
  const { g, w } = setup();
  createArmy(g, 'roma', 'b', 10000, 0);
  createArmy(g, 'volsci', 'b', 1000, 0);
  const b = fight(g);
  assert.equal(b.vincitore, 'roma');
  assert.equal(w.battaglie, 2);
  assert.ok(armiesOf(g, 'volsci').every(a => a.prov !== 'b'));
});

test('niente battaglia tra chi non è in guerra', () => {
  const { g } = setup();
  createArmy(g, 'roma', 'b', 1000, 0);
  createArmy(g, 'latini', 'b', 1000, 0);
  resolveBattles(g);
  assert.ok(Object.values(g.eserciti).every(a => !a.inBattaglia));
});

test('il difensore in montagna vince più spesso a parità di forze', () => {
  let volsci = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { g } = setup(seed);
    createArmy(g, 'roma', 'c', 5000, 0);
    createArmy(g, 'volsci', 'c', 5000, 0);
    if (fight(g)?.vincitore === 'volsci') volsci++;
  }
  assert.ok(volsci / 300 > 0.6, `volsci ha vinto ${volsci}/300`);
});

test('ritirata impossibile: l\'esercito si scioglie', () => {
  const { g } = setup();
  g.province.f.controller = 'roma';
  createArmy(g, 'roma', 'c', 20000, 0);
  createArmy(g, 'volsci', 'c', 2000, 0);
  fight(g);
  assert.equal(armiesOf(g, 'volsci').length, 0);
});

test('ritirata verso la provincia propria sicura più vicina', () => {
  const { g } = setup();
  createArmy(g, 'roma', 'c', 6000, 0);
  const v = createArmy(g, 'volsci', 'c', 3000, 0);
  fight(g);
  if (g.eserciti[v.id]) {
    assert.equal(v.prov, 'f');
    assert.equal(v.morale, 0);
  }
});

test('il morale si recupera fuori dalla battaglia, con tetto', () => {
  const { g } = setup();
  const a = createArmy(g, 'roma', 'a', 1000, 0);
  a.morale = 2.98;
  recoverMorale(g);
  assert.equal(a.morale, 3);
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../combat.js'`.

- [ ] **Step 3: Implementa `public/js/sim/combat.js`**

```js
// Battaglie giornaliere: ogni giorno un dado 0-9 per parte più i modificatori.
import { rollD10 } from './rng.js';
import { armyStrength, clamp, log } from './state.js';
import { atWar, warBetween, sideOf } from './war.js';

export function resolveBattles(game) {
  for (const a of Object.values(game.eserciti)) a.inBattaglia = false;
  const byProv = {};
  for (const a of Object.values(game.eserciti)) (byProv[a.prov] ??= []).push(a);
  for (const [provId, armies] of Object.entries(byProv)) {
    if (armies.length < 2) continue;
    const first = armies[0];
    const enemy = armies.find(x => atWar(game, first.owner, x.owner));
    if (!enemy) continue;
    battleDay(game, provId,
      armies.filter(x => x.owner === first.owner),
      armies.filter(x => x.owner === enemy.owner));
  }
}

function men(side) {
  return side.reduce((s, a) => s + a.fanteria + a.cavalleria, 0);
}

function modifier(game, prov, side) {
  const owner = side[0].owner, t = game.nazioni[owner].tratti, c = game.balance.combattimento;
  let m = t.battaglia || 0;
  if (prov.controller === owner) m += c.terreno[prov.terreno];
  if (prov.terreno === 'montagna') m += t.montagna || 0;
  return m;
}

function applyLosses(side, losses, moraleLoss) {
  const total = men(side);
  for (const a of side) {
    const n = a.fanteria + a.cavalleria;
    if (!n) continue;
    const share = losses * n / total;
    a.fanteria -= Math.min(a.fanteria, Math.round(share * a.fanteria / n));
    a.cavalleria -= Math.min(a.cavalleria, Math.round(share * a.cavalleria / n));
    a.morale = Math.max(0, a.morale - moraleLoss);
  }
}

export function battleDay(game, provId, sideA, sideB) {
  const prov = game.province[provId], c = game.balance.combattimento;
  for (const a of [...sideA, ...sideB]) a.inBattaglia = true;
  const strength = side => side.reduce((s, a) => s + armyStrength(game, a), 0);
  const sA = strength(sideA), sB = strength(sideB);
  const rA = rollD10(game) + modifier(game, prov, sideA) + 1;
  const rB = rollD10(game) + modifier(game, prov, sideB) + 1;
  applyLosses(sideB, sA * rA * c.perdite, rA * c.morale * clamp(sA / Math.max(1, sB), 0.5, 2));
  applyLosses(sideA, sB * rB * c.perdite, rB * c.morale * clamp(sB / Math.max(1, sA), 0.5, 2));
  const beaten = side => side.every(a => a.morale <= 0 || a.fanteria + a.cavalleria < c.minimoUomini);
  const aLost = beaten(sideA), bLost = beaten(sideB);
  if (!aLost && !bLost) return null;
  // se cadono entrambe, perde chi ha meno uomini
  const loser = aLost && bLost ? (men(sideA) <= men(sideB) ? sideA : sideB) : (aLost ? sideA : sideB);
  const winner = loser === sideA ? sideB : sideA;
  recordBattle(game, winner[0].owner, loser[0].owner);
  log(game, { tipo: 'battaglia', prov: provId, vincitore: winner[0].owner, sconfitto: loser[0].owner });
  for (const a of loser) retreat(game, a);
  return winner[0].owner;
}

function recordBattle(game, winner, loser) {
  const war = warBetween(game, winner, loser);
  if (!war) return;
  const g = game.balance.guerra;
  const delta = sideOf(war, winner) === 'attaccanti' ? g.puntiBattaglia : -g.puntiBattaglia;
  war.battaglie = clamp(war.battaglie + delta, -g.maxBattaglie, g.maxBattaglie);
}

// Ritirata nella provincia propria più vicina, controllata e senza nemici; altrimenti si scioglie.
export function retreat(game, army) {
  if (army.fanteria + army.cavalleria < game.balance.combattimento.minimoUomini) {
    delete game.eserciti[army.id];
    return;
  }
  const safe = id => {
    const p = game.province[id];
    return p.owner === army.owner && p.controller === army.owner &&
      !Object.values(game.eserciti).some(e => e.prov === id && atWar(game, army.owner, e.owner));
  };
  const seen = new Set([army.prov]);
  let frontier = [army.prov];
  while (frontier.length) {
    const next = [];
    for (const id of frontier) {
      for (const v of game.province[id].vicini) {
        if (seen.has(v)) continue;
        seen.add(v);
        if (safe(v)) {
          army.prov = v;
          army.percorso = [];
          army.morale = 0;
          return;
        }
        next.push(v);
      }
    }
    frontier = next;
  }
  delete game.eserciti[army.id];
}

export function recoverMorale(game) {
  const c = game.balance.combattimento;
  for (const a of Object.values(game.eserciti)) {
    if (!a.inBattaglia) a.morale = Math.min(c.moraleMax, a.morale + c.recuperoMorale);
  }
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 37 test. Se il test della montagna fallisce di poco, NON cambiare la soglia del test: stampa il conteggio e rivedi `modifier`.

- [ ] **Step 5: Commit**

```bash
git add public/js/sim/combat.js test/combat.test.js
git commit -m "feat: battaglie, ritirate e morale"
```

---

### Task 7: Assedi — *inline*

**Files:**
- Create: `public/js/sim/siege.js`
- Test: `test/siege.test.js`

**Interfaces:**
- Consumes: `nextRandom`, `log`, `atWar`.
- Produces: `siegeChance(game, army, prov) → number`, `advanceSieges(game)`.

- [ ] **Step 1: Scrivi i test che falliscono `test/siege.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { createArmy } from '../public/js/sim/state.js';
import { declareWar } from '../public/js/sim/war.js';
import { siegeChance, advanceSieges } from '../public/js/sim/siege.js';

function setup() {
  const g = makeGame();
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  return g;
}

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('probabilità: forza, fortificazione, tratto, tetto', () => {
  const g = setup();
  const a = createArmy(g, 'roma', 'c', 5000, 0);
  close(siegeChance(g, a, g.province.c), 0.1);
  g.province.c.fort = 3;
  close(siegeChance(g, a, g.province.c), 0.025);
  g.nazioni.roma.tratti.assedio = -0.5;
  close(siegeChance(g, a, g.province.c), 0.0125);
  a.fanteria = 1000000;
  g.nazioni.roma.tratti.assedio = 0;
  close(siegeChance(g, a, g.province.c), 0.2);
});

test('in guerra la provincia cade', () => {
  const g = setup();
  declareWar(g, 'roma', 'volsci');
  createArmy(g, 'roma', 'c', 5000, 0);
  for (let i = 0; i < 100 && g.province.c.controller === 'volsci'; i++) advanceSieges(g);
  assert.equal(g.province.c.controller, 'roma');
  assert.ok(g.log.some(e => e.tipo === 'assedio'));
});

test('niente assedio senza guerra o con nemici presenti', () => {
  const g = setup();
  createArmy(g, 'roma', 'c', 5000, 0);
  for (let i = 0; i < 100; i++) advanceSieges(g);
  assert.equal(g.province.c.controller, 'volsci');
  declareWar(g, 'roma', 'volsci');
  createArmy(g, 'volsci', 'c', 100, 0);
  for (let i = 0; i < 100; i++) advanceSieges(g);
  assert.equal(g.province.c.controller, 'volsci');
});

test('una provincia propria occupata si riprende', () => {
  const g = setup();
  declareWar(g, 'roma', 'volsci');
  g.province.b.controller = 'volsci';
  createArmy(g, 'roma', 'b', 5000, 0);
  for (let i = 0; i < 100 && g.province.b.controller !== 'roma'; i++) advanceSieges(g);
  assert.equal(g.province.b.controller, 'roma');
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../siege.js'`.

- [ ] **Step 3: Implementa `public/js/sim/siege.js`**

```js
// Assedi: ogni giorno un esercito fermo in una provincia nemica ha una probabilità di prenderla.
import { nextRandom } from './rng.js';
import { log } from './state.js';
import { atWar } from './war.js';

export function siegeChance(game, army, prov) {
  const s = game.balance.assedio, t = game.nazioni[army.owner].tratti;
  const base = Math.min(s.massimo, s.base * (army.fanteria + army.cavalleria) / 1000 / (prov.fort + 1));
  return base * (1 + (t.assedio || 0));
}

export function advanceSieges(game) {
  for (const a of Object.values(game.eserciti)) {
    if (a.inBattaglia || a.percorso.length) continue;
    const p = game.province[a.prov];
    if (p.controller === a.owner || !atWar(game, a.owner, p.controller)) continue;
    if (Object.values(game.eserciti).some(e => e.prov === p.id && atWar(game, a.owner, e.owner))) continue;
    if (nextRandom(game) < siegeChance(game, a, p)) {
      p.controller = a.owner;
      log(game, { tipo: 'assedio', prov: p.id, nazione: a.owner });
    }
  }
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 41 test.

- [ ] **Step 5: Commit**

```bash
git add public/js/sim/siege.js test/siege.test.js
git commit -m "feat: assedi"
```

---

### Task 8: Comandi, ciclo giornaliero, punteggio — *inline*

**Files:**
- Create: `public/js/sim/commands.js`, `public/js/sim/loop.js`, `public/js/sim/score.js`
- Test: `test/loop.test.js`

**Interfaces:**
- Consumes: tutti i moduli `sim/`.
- Produces:
  - `applyCommand(game, cmd) → { ok, motivo?, ... }`. Comandi (campo `nazione` = chi dà l'ordine):
    - `{ tipo: 'dichiara_guerra', nazione, contro }`
    - `{ tipo: 'muovi', nazione, esercito, verso }`
    - `{ tipo: 'recluta', nazione, provincia, fanteria, cavalleria }`
    - `{ tipo: 'alza_stabilita', nazione }`
    - `{ tipo: 'proponi_pace', nazione, guerra, termini: { ricevente, province } }`
    - `{ tipo: 'rispondi', nazione, proposta, accetta }`
  - `advanceDay(game, controllers = {}) → log del giorno`. `controllers[id](game, id) → cmd[]`.
  - `isOver(game) → bool`.
  - `score(game, id)`, `ranking(game) → [{ id, punteggio, vivo }]`.

- [ ] **Step 1: Scrivi i test che falliscono `test/loop.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf } from '../public/js/sim/state.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { advanceDay, isOver } from '../public/js/sim/loop.js';
import { score, ranking } from '../public/js/sim/score.js';
import { END_DAY } from '../public/js/sim/calendar.js';

test('comandi: smistamento e rifiuti', () => {
  const g = makeGame();
  assert.equal(applyCommand(g, { tipo: 'boh', nazione: 'roma' }).motivo, 'comando sconosciuto: boh');
  assert.equal(applyCommand(g, { tipo: 'dichiara_guerra', nazione: 'roma', contro: 'volsci' }).ok, true);
  const [v] = armiesOf(g, 'volsci');
  assert.equal(applyCommand(g, { tipo: 'muovi', nazione: 'roma', esercito: v.id, verso: 'f' }).motivo, 'esercito non tuo');
  const [r] = armiesOf(g, 'roma');
  assert.equal(applyCommand(g, { tipo: 'muovi', nazione: 'roma', esercito: r.id, verso: 'c' }).ok, true);
});

test('il giorno avanza, l\'economia gira il primo del mese', () => {
  const g = makeGame();
  for (let i = 0; i < 9; i++) advanceDay(g);
  const t9 = g.nazioni.roma.tesoro;
  advanceDay(g); // arriva al 1 maggio
  assert.equal(g.day, 10);
  assert.notEqual(g.nazioni.roma.tesoro, t9);
  const t10 = g.nazioni.roma.tesoro;
  advanceDay(g);
  assert.equal(g.nazioni.roma.tesoro, t10);
});

test('i controller vengono chiamati e i loro comandi applicati', () => {
  const g = makeGame();
  let calls = 0;
  const controllers = {
    roma: (game, id) => { calls++; return game.day === 0 ? [{ tipo: 'dichiara_guerra', nazione: id, contro: 'volsci' }] : []; }
  };
  const log = advanceDay(g, controllers);
  assert.equal(calls, 1);
  assert.ok(log.some(e => e.tipo === 'guerra'));
});

test('fine partita', () => {
  const g = makeGame();
  assert.equal(isOver(g), false);
  g.day = END_DAY;
  assert.equal(isOver(g), true);
});

test('punteggio e classifica', () => {
  const g = makeGame();
  assert.equal(score(g, 'roma'), 6 + 2);
  g.province.c.owner = 'roma';
  assert.equal(score(g, 'roma'), 6 + 2 + 1);
  assert.deepEqual(ranking(g).map(r => r.id), ['roma', 'latini', 'siculi', 'volsci']);
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../commands.js'`.

- [ ] **Step 3: Implementa**

`public/js/sim/commands.js`:

```js
// Unico ingresso delle decisioni nella simulazione: giocatore, regole e Jev passano da qui.
import { declareWar, proposePeace, answerProposal } from './war.js';
import { orderMove, recruit } from './armies.js';
import { raiseStability } from './economy.js';

export function applyCommand(game, cmd) {
  switch (cmd.tipo) {
    case 'dichiara_guerra':
      return declareWar(game, cmd.nazione, cmd.contro);
    case 'muovi': {
      const a = game.eserciti[cmd.esercito];
      if (!a || a.owner !== cmd.nazione) return { ok: false, motivo: 'esercito non tuo' };
      return orderMove(game, cmd.esercito, cmd.verso);
    }
    case 'recluta':
      return recruit(game, cmd.nazione, cmd.provincia, cmd.fanteria, cmd.cavalleria);
    case 'alza_stabilita':
      return raiseStability(game, cmd.nazione);
    case 'proponi_pace':
      return proposePeace(game, cmd.nazione, cmd.guerra, cmd.termini);
    case 'rispondi':
      return answerProposal(game, cmd.nazione, cmd.proposta, cmd.accetta);
    default:
      return { ok: false, motivo: `comando sconosciuto: ${cmd.tipo}` };
  }
}
```

`public/js/sim/loop.js`:

```js
// Un giorno di simulazione. Ordine fisso: decisioni, movimento, battaglie, assedi, morale,
// scadenze; poi, sul giorno nuovo, economia mensile e aggiornamento annuale.
import { applyCommand } from './commands.js';
import { advanceMovement } from './armies.js';
import { resolveBattles, recoverMorale } from './combat.js';
import { advanceSieges } from './siege.js';
import { expireProposals } from './war.js';
import { monthlyEconomy, yearlyUpdate } from './economy.js';
import { isFirstOfMonth, isNewYear, END_DAY } from './calendar.js';

export function advanceDay(game, controllers = {}) {
  game.log = [];
  for (const id of game.ordine) {
    if (!game.nazioni[id].vivo || !controllers[id]) continue;
    for (const cmd of controllers[id](game, id)) applyCommand(game, cmd);
  }
  advanceMovement(game);
  resolveBattles(game);
  advanceSieges(game);
  recoverMorale(game);
  expireProposals(game);
  game.day += 1;
  if (isFirstOfMonth(game.day)) monthlyEconomy(game);
  if (isNewYear(game.day)) yearlyUpdate(game);
  return game.log;
}

export function isOver(game) {
  return game.day >= END_DAY;
}
```

`public/js/sim/score.js`:

```js
// Punteggio di fine partita: tasse possedute più un bonus per le province della propria cultura.
import { provincesOf } from './state.js';

export function score(game, id) {
  const n = game.nazioni[id], bonus = game.balance.punteggio.culturaPropria;
  return provincesOf(game, id).reduce((s, p) => s + p.tasse + (p.cultura === n.cultura ? bonus : 0), 0);
}

export function ranking(game) {
  return game.ordine
    .map(id => ({ id, punteggio: score(game, id), vivo: game.nazioni[id].vivo }))
    .sort((a, b) => b.punteggio - a.punteggio || a.id.localeCompare(b.id));
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 46 test.

- [ ] **Step 5: Commit**

```bash
git add public/js/sim/commands.js public/js/sim/loop.js public/js/sim/score.js test/loop.test.js
git commit -m "feat: comandi, ciclo giornaliero e punteggio"
```

---

### Task 9: IA a regole — *inline*

**Files:**
- Create: `public/js/ai/rules.js`
- Test: `test/rules.test.js`

**Interfaces:**
- Consumes: `state.js`, `war.js`, `armies.js` (`distancesFrom`), `economy.js` (`stabilityCost`), `calendar.js` (`isFirstOfMonth`), `commands.js` (solo nei test), `loop.js` (solo nei test).
- Produces:
  - `rulesController(game, id) → cmd[]` (da usare in `controllers`).
  - `isReviewDay(game, id)` (una revisione ogni 91 giorni, sfalsata per nazione).
  - `enemiesOfNation(game, id) → [id]`.
  - `warCandidates(game, id) → [{ id, rapporto }]` ordinati per rapporto decrescente.
  - `strategy(game, id) → cmd[]`, `answerProposals(game, id) → cmd[]`, `armyOrders(game, id) → cmd[]`, `recruitment(game, id) → cmd[]`.
  - `power(game, id)` = uomini negli eserciti + metà della riserva.
  - Il task 3 della tappa Jev riuserà `warCandidates` per costruire le opzioni di guerra.

- [ ] **Step 1: Scrivi i test che falliscono `test/rules.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf } from '../public/js/sim/state.js';
import { declareWar, proposePeace } from '../public/js/sim/war.js';
import { advanceDay } from '../public/js/sim/loop.js';
import {
  rulesController, warCandidates, strategy, answerProposals, armyOrders, recruitment
} from '../public/js/ai/rules.js';

const allRules = g => Object.fromEntries(g.ordine.map(id => [id, rulesController]));

test('candidati di guerra: confinanti, fuori tregua, per rapporto di forze', () => {
  const g = makeGame();
  assert.deepEqual(warCandidates(g, 'roma').map(c => c.id), ['volsci', 'latini']);
  g.nazioni.roma.tregue.volsci = 999;
  assert.deepEqual(warCandidates(g, 'roma').map(c => c.id), ['latini']);
});

test('strategia: attacca il più debole se il rapporto basta e la stabilità regge', () => {
  const g = makeGame();
  assert.deepEqual(strategy(g, 'roma'), [{ tipo: 'dichiara_guerra', nazione: 'roma', contro: 'volsci' }]);
  g.nazioni.roma.stabilita = -1;
  assert.deepEqual(strategy(g, 'roma'), []);
  g.nazioni.roma.stabilita = 0;
  g.nazioni.roma.infamia = 20;
  assert.deepEqual(strategy(g, 'roma'), []);
});

test('strategia in guerra: chiede le province occupate che il punteggio copre', () => {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  assert.deepEqual(strategy(g, 'roma'), [
    { tipo: 'proponi_pace', nazione: 'roma', guerra, termini: { ricevente: 'roma', province: ['c'] } }
  ]);
  proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'] });
  assert.deepEqual(strategy(g, 'roma'), []); // già in attesa
});

test('risposte: accetta guadagni, cede solo se il nemico vince abbastanza', () => {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  const p = proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'] }).proposta;
  assert.deepEqual(answerProposals(g, 'volsci'), [{ tipo: 'rispondi', nazione: 'volsci', proposta: p, accetta: true }]);
  delete g.proposte[p];
  g.guerre[guerra].battaglie = -25; // punteggio roma 25: cedere c (50) non è giustificato
  const p2 = proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'] }).proposta;
  assert.deepEqual(answerProposals(g, 'volsci'), [{ tipo: 'rispondi', nazione: 'volsci', proposta: p2, accetta: false }]);
});

test('eserciti: in guerra vanno verso la provincia nemica più vicina, in pace a casa', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  r.prov = 'b';
  assert.deepEqual(armyOrders(g, 'roma'), [{ tipo: 'muovi', nazione: 'roma', esercito: r.id, verso: 'a' }]);
  r.prov = 'a';
  declareWar(g, 'roma', 'volsci');
  assert.deepEqual(armyOrders(g, 'roma'), [{ tipo: 'muovi', nazione: 'roma', esercito: r.id, verso: 'c' }]);
});

test('reclutamento: sotto obiettivo, con uomini e denaro', () => {
  const g = makeGame();
  assert.deepEqual(recruitment(g, 'roma'), [
    { tipo: 'recluta', nazione: 'roma', provincia: 'a', fanteria: 450, cavalleria: 50 }
  ]);
  g.nazioni.roma.tesoro = 0;
  assert.deepEqual(recruitment(g, 'roma'), []);
});

test('determinismo: stesso seme, stessa partita', () => {
  const a = makeGame(7), b = makeGame(7);
  for (let i = 0; i < 365 * 20; i++) { advanceDay(a, allRules(a)); advanceDay(b, allRules(b)); }
  assert.deepEqual(a, b);
});

test('salvataggio e ricarica a metà partita proseguono identici', () => {
  const a = makeGame(3);
  for (let i = 0; i < 365 * 5; i++) advanceDay(a, allRules(a));
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 365 * 5; i++) { advanceDay(a, allRules(a)); advanceDay(b, allRules(b)); }
  assert.deepEqual(a, b);
});

test('invarianti dopo 50 anni', () => {
  const g = makeGame(11);
  for (let i = 0; i < 365 * 50; i++) advanceDay(g, allRules(g));
  for (const p of Object.values(g.province)) assert.ok(g.nazioni[p.owner].vivo, `${p.id} di nazione morta`);
  for (const a of Object.values(g.eserciti)) {
    assert.ok(g.nazioni[a.owner].vivo);
    assert.ok(a.fanteria >= 0 && a.cavalleria >= 0);
    assert.ok(a.morale >= 0 && a.morale <= 3);
  }
  for (const n of Object.values(g.nazioni)) assert.ok(Number.isFinite(n.tesoro) && Number.isFinite(n.infamia));
});
```

Nota sul test "reclutamento": obiettivo `3900 * 0.8 = 3120`, esercito `2574`, mancano 546, arrotondati a 500 → 450 fanti e 50 cavalieri (costo 1.15; tesoro 3.6 ≥ 1.15 + 2 di riserva).

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../ai/rules.js'`.

- [ ] **Step 3: Implementa `public/js/ai/rules.js`**

```js
// IA a regole. Legge lo stato e restituisce comandi; non modifica mai lo stato.
// Fa il lavoro di fino (eserciti, reclute) per tutti, e le scelte strategiche quando Jev non c'è.
import { armiesOf, maxManpower, bordersNation } from '../sim/state.js';
import { atWar, inTruce, hasPretext, sideOf, enemiesOf, scoreFor, peaceCost } from '../sim/war.js';
import { distancesFrom } from '../sim/armies.js';
import { stabilityCost } from '../sim/economy.js';
import { isFirstOfMonth } from '../sim/calendar.js';

function hashId(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export function isReviewDay(game, id) {
  return game.day % 91 === hashId(id) % 91;
}

export function enemiesOfNation(game, id) {
  return game.ordine.filter(o => game.nazioni[o].vivo && atWar(game, id, o));
}

export function power(game, id) {
  const men = armiesOf(game, id).reduce((s, a) => s + a.fanteria + a.cavalleria, 0);
  return men + game.nazioni[id].uomini * 0.5;
}

export function warCandidates(game, id) {
  const mine = power(game, id);
  return game.ordine
    .filter(o => o !== id && game.nazioni[o].vivo && !inTruce(game, id, o) && !atWar(game, id, o) && bordersNation(game, id, o))
    .map(o => ({ id: o, rapporto: mine / Math.max(1, power(game, o)) }))
    .sort((a, b) => b.rapporto - a.rapporto || a.id.localeCompare(b.id));
}

export function rulesController(game, id) {
  const cmds = [...answerProposals(game, id)];
  if (isReviewDay(game, id)) cmds.push(...strategy(game, id));
  if ((game.day + hashId(id)) % 7 === 0) cmds.push(...armyOrders(game, id));
  if (isFirstOfMonth(game.day)) cmds.push(...recruitment(game, id));
  return cmds;
}

export function strategy(game, id) {
  const n = game.nazioni[id], ia = game.balance.ia;
  const wars = Object.values(game.guerre).filter(w => sideOf(w, id));
  if (!wars.length) {
    const best = warCandidates(game, id)[0];
    if (!best || best.rapporto < ia.rapportoGuerra) return [];
    if (n.infamia >= game.balance.infamia.soglia) return [];
    if (!hasPretext(game, id, best.id) && n.stabilita < 0) return [];
    return [{ tipo: 'dichiara_guerra', nazione: id, contro: best.id }];
  }
  const cmds = [];
  for (const war of wars) {
    const side = sideOf(war, id);
    if (war[side][0] !== id) continue; // decide il capofila
    if (Object.values(game.proposte).some(p => p.guerra === war.id && p.da === id)) continue;
    const enemySide = side === 'attaccanti' ? 'difensori' : 'attaccanti';
    const enemyLeader = enemiesOf(war, side)[0];
    const s = scoreFor(game, war, id);
    const byTax = (a, b) => b.tasse - a.tasse || a.id.localeCompare(b.id);
    if (s >= ia.pacePunteggio) {
      const occupied = Object.values(game.province)
        .filter(p => war[enemySide].includes(p.owner) && war[side].includes(p.controller)).sort(byTax);
      const scelte = [];
      for (const p of occupied) if (peaceCost(game, war, id, { province: [...scelte, p.id] }) <= s) scelte.push(p.id);
      if (scelte.length) cmds.push({ tipo: 'proponi_pace', nazione: id, guerra: war.id, termini: { ricevente: id, province: scelte } });
    } else if (s <= ia.resaPunteggio) {
      const lost = Object.values(game.province)
        .filter(p => war[side].includes(p.owner) && war[enemySide].includes(p.controller)).sort(byTax);
      const scelte = [];
      for (const p of lost) if (peaceCost(game, war, enemyLeader, { province: [...scelte, p.id] }) <= -s) scelte.push(p.id);
      cmds.push({ tipo: 'proponi_pace', nazione: id, guerra: war.id, termini: { ricevente: enemyLeader, province: scelte } });
    } else if (game.day - war.inizio >= ia.paceBiancaAnni * 365 && Math.abs(s) < 10) {
      cmds.push({ tipo: 'proponi_pace', nazione: id, guerra: war.id, termini: { ricevente: id, province: [] } });
    }
  }
  return cmds;
}

// Accetta ciò che riceve; cede solo se il costo non supera di 10 il vantaggio del nemico.
export function answerProposals(game, id) {
  const cmds = [];
  for (const p of Object.values(game.proposte)) {
    if (p.a !== id) continue;
    const war = game.guerre[p.guerra];
    let accetta = true;
    if (p.termini.ricevente !== id) {
      accetta = peaceCost(game, war, p.termini.ricevente, p.termini) <= -scoreFor(game, war, id) + 10;
    }
    cmds.push({ tipo: 'rispondi', nazione: id, proposta: p.id, accetta });
  }
  return cmds;
}

export function armyOrders(game, id) {
  const cmds = [];
  const enemies = enemiesOfNation(game, id);
  const capital = game.nazioni[id].capitale;
  for (const a of armiesOf(game, id)) {
    if (a.inBattaglia || a.percorso.length) continue;
    if (!enemies.length) {
      if (a.prov !== capital) cmds.push({ tipo: 'muovi', nazione: id, esercito: a.id, verso: capital });
      continue;
    }
    const here = game.province[a.prov];
    if (here.controller !== id && enemies.includes(here.controller)) continue; // sta assediando
    if (a.morale < game.balance.combattimento.moraleMax / 2) continue; // si riprende
    const targets = Object.values(game.province).filter(p =>
      (p.owner === id && enemies.includes(p.controller)) || (enemies.includes(p.owner) && p.controller !== id));
    const { dist } = distancesFrom(game, id, a.prov);
    let best = null;
    for (const p of targets) {
      if (dist[p.id] === undefined) continue;
      if (best === null || dist[p.id] < dist[best] || (dist[p.id] === dist[best] && p.id < best)) best = p.id;
    }
    if (best) cmds.push({ tipo: 'muovi', nazione: id, esercito: a.id, verso: best });
  }
  return cmds;
}

export function recruitment(game, id) {
  const n = game.nazioni[id], ia = game.balance.ia, c = game.balance.costi;
  const cmds = [];
  const men = armiesOf(game, id).reduce((s, a) => s + a.fanteria + a.cavalleria, 0);
  const deficit = Math.round(maxManpower(game, id) * ia.esercitoObiettivo) - men;
  const capital = game.province[n.capitale];
  if (deficit > 0 && n.uomini >= ia.reclutaSoglia && capital.controller === id) {
    const total = Math.floor(Math.min(n.uomini, deficit) / 100) * 100;
    const cavalleria = Math.round(total * 0.1), fanteria = total - cavalleria;
    const costo = fanteria / 1000 * c.fanteria1000 + cavalleria / 1000 * c.cavalleria1000;
    if (total > 0 && n.tesoro >= costo + ia.riservaTesoro) {
      cmds.push({ tipo: 'recluta', nazione: id, provincia: n.capitale, fanteria, cavalleria });
    }
  }
  if (!cmds.length && n.stabilita < 1 && !enemiesOfNation(game, id).length &&
      n.tesoro >= stabilityCost(game, id) + ia.riservaTesoro) {
    cmds.push({ tipo: 'alza_stabilita', nazione: id });
  }
  return cmds;
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 55 test. Se un test di determinismo fallisce, cerca l'iterazione non ordinata o un `Math.random` (vietato in `sim/` e `ai/`).

- [ ] **Step 5: Commit**

```bash
git add public/js/ai/rules.js test/rules.test.js
git commit -m "feat: IA a regole per guerra, pace, eserciti e reclute"
```

---

### Task 10: Strumento mappa — *inline*

**Files:**
- Create: `tools/fetch-ne.sh`, `tools/geo.js`, `tools/build-map.js`, `data/confine.json`
- Test: `test/geo.test.js`

**Interfaces:**
- Consumes: `d3-delaunay`, `d3-geo`, `polygon-clipping`.
- Produces:
  - `geo.js`: `ringArea(ring)`, `pointInRing([x, y], ring)`, `simplifyRing(ring, tol)`, `sharedVertexCount(multiA, multiB, tol)`, `buildProvinces({ pieces, centers, width, height }) → [{ id, poligoni, piece }]` (Voronoi separato per ogni terra; lancia un errore se un centro non cade su una terra o se la sua cella resta vuota), `buildAdjacency(cells, { collegamenti, tagli }) → { [id]: [id] }`.
  - `build-map.js`: legge `data/ne/ne_10m_land.geojson`, `data/confine.json`, `data/centri.json`; scrive `public/data/map.json` con la forma definita nel task 2.
  - `data/centri.json` (forma, riempito nel task 12): `{ centri: [{ id, nome, lon, lat, terreno, tasse, uomini, fort, cultura, owner }], collegamenti: [[a, b]], tagli: [[a, b]] }`. I `collegamenti` sono anche gli stretti.

- [ ] **Step 1: Scrivi i test che falliscono `test/geo.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringArea, pointInRing, simplifyRing, sharedVertexCount, buildProvinces, buildAdjacency } from '../tools/geo.js';

const square = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];

test('area e punto nel poligono', () => {
  assert.equal(Math.abs(ringArea(square)), 10000);
  assert.equal(pointInRing([50, 50], square), true);
  assert.equal(pointInRing([150, 50], square), false);
});

test('semplificazione: toglie i punti allineati, tiene gli angoli', () => {
  const ring = [[0, 0], [50, 0.1], [100, 0], [100, 100], [0, 100], [0, 0]];
  assert.deepEqual(simplifyRing(ring, 0.5), square);
});

test('quattro centri in un quadrato: quattro celle, confini solo sui lati', () => {
  const centers = [
    { id: 'no', x: 25, y: 25 }, { id: 'ne', x: 75, y: 25 },
    { id: 'so', x: 25, y: 75 }, { id: 'se', x: 75, y: 75 }
  ];
  const cells = buildProvinces({ pieces: [[square]], centers, width: 100, height: 100 });
  for (const c of cells) {
    const area = c.poligoni.reduce((s, poly) => s + Math.abs(ringArea(poly[0])), 0);
    assert.ok(Math.abs(area - 2500) < 1e-6, `${c.id}: ${area}`);
  }
  const adj = buildAdjacency(cells, { collegamenti: [], tagli: [['no', 'ne']] });
  assert.deepEqual(adj.no, ['so']);
  assert.deepEqual(adj.se.sort(), ['ne', 'so']);
  assert.equal(sharedVertexCount(cells[0].poligoni, cells[3].poligoni, 0.5), 1); // solo l'angolo
});

test('isole separate: niente confine attraverso il mare, sì con un collegamento', () => {
  const left = [[0, 0], [40, 0], [40, 100], [0, 100], [0, 0]];
  const right = [[60, 0], [100, 0], [100, 100], [60, 100], [60, 0]];
  const centers = [{ id: 'l', x: 20, y: 50 }, { id: 'r', x: 80, y: 50 }];
  const cells = buildProvinces({ pieces: [[left], [right]], centers, width: 100, height: 100 });
  assert.deepEqual(cells.map(c => c.piece), [0, 1]);
  const area = c => c.poligoni.reduce((s, poly) => s + Math.abs(ringArea(poly[0])), 0);
  assert.ok(Math.abs(area(cells[0]) - 4000) < 1e-6); // tutta l'isola, anche oltre la metà
  assert.deepEqual(buildAdjacency(cells, { collegamenti: [], tagli: [] }).l, []);
  assert.deepEqual(buildAdjacency(cells, { collegamenti: [['l', 'r']], tagli: [] }).l, ['r']);
});

test('una terra con un solo centro diventa una sola provincia intera', () => {
  const [c] = buildProvinces({ pieces: [[square]], centers: [{ id: 'solo', x: 10, y: 10 }], width: 100, height: 100 });
  assert.ok(Math.abs(Math.abs(ringArea(c.poligoni[0][0])) - 10000) < 1e-6);
});

test('un centro in mare è un errore', () => {
  assert.throws(
    () => buildProvinces({ pieces: [[square]], centers: [{ id: 'x', x: 150, y: 50 }], width: 200, height: 100 }),
    /x/
  );
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../tools/geo.js'`.

- [ ] **Step 3: Implementa `tools/geo.js`**

```js
// Funzioni pure per costruire le province: Voronoi sui centri, tagliato sulla terra.
// Coordinate già proiettate (pixel). Poligono = [anello esterno, ...buchi]; multipoligono = [poligono, ...].
import { Delaunay } from 'd3-delaunay';
import polygonClipping from 'polygon-clipping';

export function ringArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return s / 2;
}

export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function rdp(points, tol) {
  if (points.length < 3) return points;
  let max = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = segmentDistance(points[i], points[0], points[points.length - 1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [points[0], points[points.length - 1]];
  return [...rdp(points.slice(0, idx + 1), tol).slice(0, -1), ...rdp(points.slice(idx), tol)];
}

// Ramer-Douglas-Peucker su un anello chiuso: si divide in due metà dal punto più lontano dal primo.
export function simplifyRing(ring, tol) {
  const open = ring.slice(0, -1);
  if (open.length < 4) return ring;
  let far = 0, max = -1;
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
    if (d > max) { max = d; far = i; }
  }
  const a = rdp(open.slice(0, far + 1), tol);
  const b = rdp([...open.slice(far), open[0]], tol);
  return [...a.slice(0, -1), ...b];
}

export function sharedVertexCount(multiA, multiB, tol) {
  const pts = multiB.flatMap(poly => poly.flatMap(r => r));
  const seen = [];
  for (const poly of multiA) for (const ring of poly) for (const p of ring) {
    if (seen.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol)) continue;
    if (pts.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol)) seen.push(p);
  }
  return seen.length;
}

export function buildProvinces({ pieces, centers, width, height }) {
  const pieceOf = centers.map(c => {
    const i = pieces.findIndex(poly => pointInRing([c.x, c.y], poly[0]) && !poly.slice(1).some(h => pointInRing([c.x, c.y], h)));
    if (i < 0) throw new Error(`centro ${c.id} fuori dalla terra`);
    return i;
  });
  const cells = new Array(centers.length);
  // Voronoi separato per ogni terra: le celle coprono tutta la penisola o l'isola, senza buchi
  // lasciati da centri che stanno sull'altra sponda.
  pieces.forEach((piece, p) => {
    const idx = centers.map((_, i) => i).filter(i => pieceOf[i] === p);
    if (!idx.length) return;
    const voronoi = Delaunay.from(idx.map(i => [centers[i].x, centers[i].y])).voronoi([0, 0, width, height]);
    idx.forEach((i, k) => {
      const poligoni = polygonClipping.intersection([voronoi.cellPolygon(k)], piece);
      if (!poligoni.length) throw new Error(`cella vuota per ${centers[i].id}`);
      cells[i] = { id: centers[i].id, poligoni, piece: p };
    });
  });
  return cells;
}

function bbox(multi) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of multi) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

// Confinano due celle sulla stessa terra che condividono un lato (almeno due vertici).
export function buildAdjacency(cells, { collegamenti, tagli }) {
  const adj = Object.fromEntries(cells.map(c => [c.id, new Set()]));
  const cut = new Set(tagli.map(([a, b]) => [a, b].sort().join('|')));
  const boxes = cells.map(c => bbox(c.poligoni));
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const c = cells[i], d = cells[j], a = boxes[i], b = boxes[j];
    if (c.piece !== d.piece || cut.has([c.id, d.id].sort().join('|'))) continue;
    if (a[0] > b[2] + 1 || b[0] > a[2] + 1 || a[1] > b[3] + 1 || b[1] > a[3] + 1) continue;
    if (sharedVertexCount(c.poligoni, d.poligoni, 0.5) >= 2) { adj[c.id].add(d.id); adj[d.id].add(c.id); }
  }
  for (const [a, b] of collegamenti) { adj[a].add(b); adj[b].add(a); }
  return Object.fromEntries(Object.entries(adj).map(([k, v]) => [k, [...v].sort()]));
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 61 test.

- [ ] **Step 5: Scrivi `tools/fetch-ne.sh` e `data/confine.json`**

`tools/fetch-ne.sh`:

```sh
#!/bin/sh
# Scarica la terra di Natural Earth 10m (dominio pubblico) in data/ne/.
set -e
mkdir -p data/ne
curl -fL -o data/ne/ne_10m_land.geojson \
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson
```

`data/confine.json` (lon, lat; l'anello segue lo spartiacque alpino a nord e passa in mare altrove; `incognita` sono punti dentro Sardegna e Corsica):

```json
{
  "anello": [
    [7.20, 43.62], [7.05, 44.20], [6.85, 44.80], [6.95, 45.30], [6.80, 45.83], [7.85, 45.95],
    [8.45, 46.45], [9.30, 46.50], [10.15, 46.60], [10.50, 46.85], [11.50, 47.00], [12.25, 47.05],
    [12.70, 46.65], [13.70, 46.50], [13.75, 45.62], [13.20, 45.30], [15.40, 42.30], [18.70, 40.30],
    [16.80, 36.40], [12.40, 35.30], [11.70, 37.20], [8.00, 38.60], [8.10, 41.40], [8.40, 43.20],
    [7.20, 43.62]
  ],
  "incognita": [[9.0, 40.0], [9.1, 42.2]]
}
```

- [ ] **Step 6: Implementa `tools/build-map.js`**

```js
// Genera public/data/map.json da Natural Earth, data/confine.json e data/centri.json.
// Uso: npm run fetch-ne (una volta), poi npm run build-map.
import { readFileSync, writeFileSync } from 'node:fs';
import { geoConicConformal } from 'd3-geo';
import polygonClipping from 'polygon-clipping';
import { buildProvinces, buildAdjacency, simplifyRing, pointInRing, ringArea } from './geo.js';

const W = 1000, H = 1200, TOL = 0.6;
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));

const land = read('data/ne/ne_10m_land.geojson');
const { anello, incognita } = read('data/confine.json');
const { centri, collegamenti, tagli } = read('data/centri.json');

const landMulti = land.features.flatMap(f =>
  f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
const italy = polygonClipping.intersection(landMulti, [anello]);

// Si inquadra sui vertici dell'anello come punti: polygon-clipping produce anelli antiorari,
// che d3-geo leggerebbe come "tutto il globo tranne l'Italia".
const projection = geoConicConformal().parallels([38, 46]).rotate([-12.5, 0])
  .fitExtent([[20, 20], [W - 20, H - 20]], { type: 'MultiPoint', coordinates: anello });
const proj = ([lon, lat]) => projection([lon, lat]).map(v => Math.round(v * 10) / 10);

const projected = italy
  .map(poly => poly.map(ring => simplifyRing(ring.map(proj), TOL)))
  .filter(poly => poly[0].length >= 4 && Math.abs(ringArea(poly[0])) > 1);

const centers = centri.map(c => { const [x, y] = proj([c.lon, c.lat]); return { id: c.id, x, y }; });
const playable = projected.filter(poly => centers.some(c => pointInRing([c.x, c.y], poly[0])));
const incognitaPts = incognita.map(proj);
const decorazioni = projected
  .filter(poly => !playable.includes(poly))
  .map(poly => ({ tipo: incognitaPts.some(p => pointInRing(p, poly[0])) ? 'incognita' : 'isola', poligoni: [poly] }));

const cells = buildProvinces({ pieces: playable, centers, width: W, height: H });
const vicini = buildAdjacency(cells, { collegamenti, tagli });

const round = multi => multi.map(poly => poly.map(ring => ring.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])));
const map = {
  width: W, height: H,
  province: centri.map((c, i) => ({
    id: c.id, nome: c.nome, terreno: c.terreno, tasse: c.tasse, uomini: c.uomini, fort: c.fort,
    cultura: c.cultura, owner: c.owner, centro: [centers[i].x, centers[i].y],
    poligoni: round(cells[i].poligoni), vicini: vicini[c.id]
  })),
  stretti: collegamenti,
  decorazioni
};
writeFileSync(new URL('../public/data/map.json', import.meta.url), JSON.stringify(map));
const isolated = map.province.filter(p => p.vicini.length === 0).map(p => p.id);
console.log(`province: ${map.province.length}, decorazioni: ${decorazioni.length}, isolate: ${isolated.join(', ') || 'nessuna'}`);
```

- [ ] **Step 7: Prova lo strumento su un `data/centri.json` provvisorio**

Crea `data/centri.json` provvisorio con tre centri (sarà sostituito nel task 12):

```json
{
  "centri": [
    { "id": "roma", "nome": "Roma", "lon": 12.4823, "lat": 41.8919, "terreno": "collina", "tasse": 5, "uomini": 5, "fort": 2, "cultura": "latina", "owner": "roma" },
    { "id": "capua", "nome": "Capua", "lon": 14.2128, "lat": 41.0838, "terreno": "pianura", "tasse": 4, "uomini": 3, "fort": 1, "cultura": "osca", "owner": "opici" },
    { "id": "syrakousai", "nome": "Siracusa", "lon": 15.2866, "lat": 37.0755, "terreno": "pianura", "tasse": 3, "uomini": 2, "fort": 1, "cultura": "sicula", "owner": "siculi" }
  ],
  "collegamenti": [],
  "tagli": []
}
```

Run: `npm run fetch-ne && npm run build-map`
Expected: `province: 3, decorazioni: N, isolate: syrakousai` (la Sicilia non ha collegamenti). N ≥ 3: almeno Sardegna, Corsica ed Elba.

Controlla a occhio: scrivi uno script usa e getta nello scratchpad che converte `public/data/map.json` in SVG (un `<path>` per poligono, grigio per `incognita`), aprilo nel browser e verifica che l'Italia sia riconoscibile, che la Sardegna e la Corsica siano grigie e che il confine nord passi sulle Alpi. Non committare lo script.

- [ ] **Step 8: Commit**

```bash
git add tools/fetch-ne.sh tools/geo.js tools/build-map.js data/confine.json test/geo.test.js
git commit -m "feat: strumento di generazione della mappa (Natural Earth + Voronoi)"
```

Non committare `data/centri.json` provvisorio né `public/data/map.json`: arrivano nel task 12.

---

### Task 11: Dati dei popoli — *subagente* (può partire dopo il task 2)

**Files:**
- Create: `public/data/popoli.json`, `tools/load-data.js`
- Test: `test/data.test.js`

**Interfaces:**
- Consumes: forma di `popoli.json` definita nel task 2.
- Produces: `popoli.json` con i 38 popoli attivi e 13 dormienti qui sotto; `loadData() → { map, popoli, balance }` in `tools/load-data.js` (legge da `public/data/`).

**Contenuto richiesto.** Ogni voce: `id`, `nome`, `colore` (esadecimale `#rrggbb`, tutti diversi, leggibili su pergamena `#efe3c8`; le città etrusche in toni di ocra e rosso bruno, i popoli sabellici in verdi, i Greci in blu), `cultura`, `governo` (`tribù`, `monarchia`, `repubblica`, `lega`, `città-stato`), `capitale` (id di un centro del task 12), `difficolta` (`facile`, `normale`, `difficile`, `molto difficile`), `tratti`, `carattere` (una o due frasi in italiano su come si comporta in guerra e diplomazia, basate sulla storia; servono a Jev), e `dormiente: true` solo per i dormienti.

Tratti ammessi e intervalli: `reclute` 0..0.5, `stabilita` 0..0.5, `assimilazione` 0..0.5, `battaglia` 0..1 (intero), `montagna` 0..2 (intero), `assedio` -0.5..0.5. Al massimo tre tratti per popolo.

| id | nome | cultura | governo | capitale | difficoltà | tratti obbligatori |
|---|---|---|---|---|---|---|
| roma | Roma | latina | monarchia | roma | facile | reclute 0.5, stabilita 0.5, battaglia 1 |
| lega_latina | Lega latina | latina | lega | alba_longa | normale | |
| sabini | Sabini | sabina | tribù | cures | normale | montagna 1 |
| falisci | Falisci | falisca | città-stato | falerii | difficile | |
| veio | Veio | etrusca | monarchia | veio | normale | |
| caere | Caere | etrusca | monarchia | caere | normale | |
| tarquinia | Tarquinia | etrusca | monarchia | tarquinia | normale | |
| vulci | Vulci | etrusca | monarchia | vulci | normale | |
| volsinii | Volsinii | etrusca | monarchia | volsinii | normale | |
| chiusi | Chiusi | etrusca | monarchia | clusium | normale | |
| volterra | Volterra | etrusca | monarchia | volaterrae | normale | |
| populonia | Populonia | etrusca | monarchia | populonia | normale | |
| perugia | Perugia | etrusca | monarchia | perusia | normale | |
| arezzo | Arezzo | etrusca | monarchia | arretium | normale | |
| felsina | Felsina | etrusca | monarchia | felsina | normale | |
| umbri | Umbri | umbra | tribù | iguvium | normale | |
| piceni | Piceni | picena | tribù | asculum | normale | |
| volsci | Volsci | volsca | tribù | sora | molto difficile | montagna 1 |
| equi | Equi | equa | tribù | carsioli | molto difficile | montagna 1 |
| marsi | Marsi | sabellica | tribù | marruvium | difficile | montagna 1 |
| ernici | Ernici | ernica | lega | anagnia | difficile | |
| aurunci | Aurunci | aurunca | tribù | suessa | difficile | |
| sanniti | Sanniti | sannita | lega | bovianum | normale | montagna 2, assedio -0.5 |
| opici | Opici | osca | tribù | capua | normale | |
| cuma | Cuma | greca | città-stato | cumae | difficile | |
| enotri | Enotri | enotria | tribù | grumentum | normale | |
| itali | Itali | enotria | tribù | consentia | normale | |
| messapi | Messapi | iapigia | tribù | uria | normale | |
| peucezi | Peucezi | iapigia | tribù | caelia | difficile | |
| dauni | Dauni | iapigia | tribù | arpi | normale | |
| veneti | Veneti | veneta | tribù | ateste | normale | |
| liguri | Liguri | ligure | tribù | genua | normale | montagna 1 |
| orobi | Orobi | golasecchiana | tribù | comum | normale | |
| reti | Reti | retica | tribù | tridentum | difficile | montagna 2 |
| siculi | Siculi | sicula | tribù | henna | normale | |
| sicani | Sicani | sicana | tribù | kamikos | difficile | |
| elimi | Elimi | elima | città-stato | segesta | difficile | |
| fenici | Fenici | fenicia | città-stato | motya | normale | |

Dormienti (`dormiente: true`, `difficolta: "normale"`):

| id | nome | cultura | governo | capitale |
|---|---|---|---|---|
| siracusa | Siracusa | greca | città-stato | syrakousai |
| reggio | Reggio | greca | città-stato | rhegion |
| sibari | Sibari | greca | città-stato | sybaris |
| crotone | Crotone | greca | città-stato | kroton |
| taranto | Taranto | greca | città-stato | taras |
| locri | Locri | greca | città-stato | lokroi |
| gela | Gela | greca | città-stato | gela |
| lucani | Lucani | osca | tribù | potentia |
| bruzi | Bruzi | osca | tribù | consentia |
| senoni | Galli Senoni | gallica | tribù | sena_gallica |
| boi | Galli Boi | gallica | tribù | felsina |
| insubri | Galli Insubri | gallica | tribù | mediolanum |
| neapolis | Neapolis | greca | città-stato | cumae |

- [ ] **Step 1: Scrivi il test che fallisce `test/data.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const popoli = JSON.parse(readFileSync(new URL('../public/data/popoli.json', import.meta.url))).popoli;
const GOVERNI = ['tribù', 'monarchia', 'repubblica', 'lega', 'città-stato'];
const DIFF = ['facile', 'normale', 'difficile', 'molto difficile'];
const TRATTI = { reclute: [0, 0.5], stabilita: [0, 0.5], assimilazione: [0, 0.5], battaglia: [0, 1], montagna: [0, 2], assedio: [-0.5, 0.5] };

test('popoli: 38 attivi e 13 dormienti, id unici', () => {
  assert.equal(popoli.filter(p => !p.dormiente).length, 38);
  assert.equal(popoli.filter(p => p.dormiente).length, 13);
  assert.equal(new Set(popoli.map(p => p.id)).size, popoli.length);
});

test('popoli: campi validi', () => {
  const colori = new Set();
  for (const p of popoli) {
    assert.match(p.id, /^[a-z_]+$/, p.id);
    assert.ok(p.nome && p.cultura && p.capitale, p.id);
    assert.ok(GOVERNI.includes(p.governo), `${p.id}: ${p.governo}`);
    assert.ok(DIFF.includes(p.difficolta), `${p.id}: ${p.difficolta}`);
    assert.match(p.colore, /^#[0-9a-f]{6}$/, p.id);
    if (!p.dormiente) { assert.ok(!colori.has(p.colore), `colore ripetuto ${p.colore}`); colori.add(p.colore); }
    assert.ok(typeof p.carattere === 'string' && p.carattere.length >= 20, `${p.id}: carattere troppo corto`);
    assert.ok(Object.keys(p.tratti).length <= 3, p.id);
    for (const [k, v] of Object.entries(p.tratti)) {
      assert.ok(TRATTI[k], `${p.id}: tratto ${k}`);
      assert.ok(v >= TRATTI[k][0] && v <= TRATTI[k][1], `${p.id}: ${k}=${v}`);
    }
  }
});

test('Roma facile, Volsci molto difficili', () => {
  const by = Object.fromEntries(popoli.map(p => [p.id, p]));
  assert.equal(by.roma.difficolta, 'facile');
  assert.equal(by.volsci.difficolta, 'molto difficile');
  assert.ok(Object.keys(by.volsci.tratti).length <= 1);
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npm test`
Expected: FAIL, `ENOENT ... popoli.json`.

- [ ] **Step 3: Scrivi `public/data/popoli.json` seguendo le tabelle sopra**

Formato: `{ "popoli": [ ... ] }`, prima i 38 attivi nell'ordine della tabella, poi i dormienti. Esempio di voce:

```json
{
  "id": "sanniti", "nome": "Sanniti", "colore": "#4f7a3a", "cultura": "sannita", "governo": "lega",
  "capitale": "bovianum", "difficolta": "normale",
  "tratti": { "montagna": 2, "assedio": -0.5 },
  "carattere": "Montanari bellicosi riuniti in lega. Diffidano delle città di pianura, preferiscono razziare e combattere sui monti piuttosto che assediare."
}
```

- [ ] **Step 4: Scrivi `tools/load-data.js`**

```js
// Carica i dati reali del gioco in Node (bench e test).
import { readFileSync } from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url)));

export function loadData() {
  return { map: read('map.json'), popoli: read('popoli.json'), balance: read('balance.json') };
}
```

- [ ] **Step 5: Verifica che passino**

Run: `npm test`
Expected: PASS, tutti i test, compresi i 3 nuovi.

- [ ] **Step 6: Commit**

```bash
git add public/data/popoli.json tools/load-data.js test/data.test.js
git commit -m "feat: dati dei popoli (38 attivi, 13 dormienti)"
```

---

### Task 12: Centri delle province e mappa reale — *subagente* (dopo i task 10 e 11)

**Files:**
- Create: `data/centri.json` (sostituisce quello provvisorio), `public/data/map.json` (generato)
- Test: `test/map.test.js`

**Interfaces:**
- Consumes: `tools/build-map.js` (task 10), `public/data/popoli.json` (task 11), `tools/load-data.js`, `createGame`.
- Produces: `data/centri.json` e `public/data/map.json` reali.

**Contenuto richiesto.** Un centro per riga qui sotto: 149 in tutto. Per ciascuno: `id` (come scritto), `nome` (nome italiano corrente o latino noto, es. "Alba Longa", "Siracusa"), `lon`/`lat` del sito storico (per i siti scomparsi usa le coordinate archeologiche note; 4 decimali), `terreno` (`pianura`, `collina`, `montagna`, `palude`), `tasse` e `uomini` interi 1..10, `fort` 0..3, `cultura` (quella del proprietario, salvo `taras`, `kroton`, `sybaris`, `lokroi`, `rhegion`, `syrakousai`, `gela` che restano della cultura indigena del proprietario fino all'arrivo dei Greci), `owner`.

Vincoli di bilanciamento: Roma `tasse 5, uomini 5, fort 2`; somma delle tasse dei Volsci ≤ 6; nessun'altra provincia oltre 6 di tasse salvo Capua, Caere, Tarquinia, Veio (max 7). Province di montagna: tasse ≤ 3.

| owner | centri |
|---|---|
| roma | roma |
| lega_latina | alba_longa, lavinium, ardea, praeneste, tibur, tusculum, gabii |
| sabini | cures, reate, eretum, nomentum, amiternum, trebula_mutuesca |
| falisci | falerii, capena |
| veio | veio, fidenae |
| caere | caere, pyrgi |
| tarquinia | tarquinia |
| vulci | vulci |
| volsinii | volsinii |
| chiusi | clusium, cortona |
| volterra | volaterrae, pisae |
| populonia | populonia, vetulonia, rusellae |
| perugia | perusia |
| arezzo | arretium, faesulae |
| felsina | felsina, mutina, parma, mantua, spina |
| umbri | iguvium, tuder, spoletium, interamna, ameria, ariminum, sarsina |
| piceni | asculum, firmum, ancona, numana, sena_gallica |
| volsci | sora, arpinum, atina |
| equi | carsioli, alba_fucens |
| marsi | marruvium, corfinium, pinna |
| ernici | anagnia, ferentinum, aletrium |
| aurunci | suessa, minturnae, fundi |
| sanniti | bovianum, aesernia, saepinum, caudium, maleventum, aufidena, histonium |
| opici | capua, nola, nuceria, acerrae, cales, teanum |
| cuma | cumae |
| enotri | poseidonia, elea, grumentum, potentia, metapontion, siris, sybaris |
| itali | consentia, temesa, kroton, scylletium, hipponion, lokroi, rhegion |
| messapi | taras, uria, brundisium, hydruntum, lupiae |
| peucezi | caelia, barium, silvium |
| dauni | arpi, luceria, canusium, sipontum |
| veneti | ateste, patavium, vicetia, altinum, opitergium, aquileia, forum_iulii |
| liguri | genua, albingaunum, nicaea, luna, dertona, alba_pompeia, augusta_taurinorum, eporedia, placentia, segusio |
| orobi | comum, bergomum, mediolanum, brixia, novaria, cremona |
| reti | tridentum, pons_drusi, feltria |
| siculi | henna, morgantina, leontinoi, katane, syrakousai, naxos, zankle, agyrion, kale_akte |
| sicani | kamikos, akragas, gela, triokala |
| elimi | segesta, eryx, entella |
| fenici | motya, panormos, solus |

`collegamenti`: `[["rhegion", "zankle"]]` (stretto di Messina). `tagli`: aggiungili solo se il controllo visivo mostra confini assurdi (es. attraverso un golfo o una cresta alpina).

- [ ] **Step 1: Scrivi il test che fallisce `test/map.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../tools/load-data.js';
import { createGame } from '../public/js/sim/setup.js';

const { map, popoli, balance } = loadData();
const byId = Object.fromEntries(map.province.map(p => [p.id, p]));
const active = popoli.popoli.filter(p => !p.dormiente);

test('149 province con dati validi', () => {
  assert.equal(map.province.length, 149);
  const TERRENI = ['pianura', 'collina', 'montagna', 'palude'];
  for (const p of map.province) {
    assert.ok(TERRENI.includes(p.terreno), p.id);
    assert.ok(Number.isInteger(p.tasse) && p.tasse >= 1 && p.tasse <= 10, p.id);
    assert.ok(Number.isInteger(p.uomini) && p.uomini >= 1 && p.uomini <= 10, p.id);
    assert.ok(Number.isInteger(p.fort) && p.fort >= 0 && p.fort <= 3, p.id);
    assert.ok(active.some(n => n.id === p.owner), `${p.id}: owner ${p.owner}`);
    assert.ok(p.poligoni.length > 0, p.id);
  }
});

test('ogni provincia ha vicini simmetrici', () => {
  for (const p of map.province) {
    assert.ok(p.vicini.length > 0, `${p.id} isolata`);
    for (const v of p.vicini) assert.ok(byId[v].vicini.includes(p.id), `${p.id}-${v} non simmetrico`);
  }
});

test('terraferma e Sicilia formano un solo grafo grazie allo stretto', () => {
  const seen = new Set(['roma']);
  const queue = ['roma'];
  while (queue.length) for (const v of byId[queue.shift()].vicini) if (!seen.has(v)) { seen.add(v); queue.push(v); }
  assert.equal(seen.size, map.province.length);
  assert.ok(byId.rhegion.vicini.includes('zankle'));
});

test('capitali: ogni popolo possiede la sua; i dormienti puntano a centri esistenti', () => {
  for (const n of active) assert.equal(byId[n.capitale]?.owner, n.id, n.id);
  for (const n of popoli.popoli.filter(p => p.dormiente)) assert.ok(byId[n.capitale], n.id);
});

test('vincoli di bilanciamento', () => {
  assert.deepEqual([byId.roma.tasse, byId.roma.uomini, byId.roma.fort], [5, 5, 2]);
  const volsci = map.province.filter(p => p.owner === 'volsci').reduce((s, p) => s + p.tasse, 0);
  assert.ok(volsci <= 6, `volsci ${volsci}`);
  for (const p of map.province) {
    const max = ['capua', 'caere', 'tarquinia', 'veio'].includes(p.id) ? 7 : 6;
    if (p.id !== 'roma') assert.ok(p.tasse <= max, `${p.id} ${p.tasse}`);
    if (p.terreno === 'montagna') assert.ok(p.tasse <= 3, `${p.id} montagna ${p.tasse}`);
  }
});

test('la partita reale si crea', () => {
  const g = createGame({ map, popoli, balance, seed: 1 });
  assert.equal(g.ordine.length, 38);
  assert.equal(Object.keys(g.eserciti).length, 38);
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npm test`
Expected: FAIL (o `map.json` mancante, o 3 province invece di 149).

- [ ] **Step 3: Scrivi `data/centri.json` con i 149 centri**

- [ ] **Step 4: Genera la mappa**

Run: `npm run build-map`
Expected: `province: 149, decorazioni: N, isolate: nessuna`. Se compare un errore `centro X fuori dalla terra`, correggi le coordinate di X (spesso un sito costiero cade in mare con la costa semplificata: spostalo di 0.02° verso l'interno).

- [ ] **Step 5: Controllo visivo**

Con uno script usa e getta nello scratchpad, disegna `map.json` in SVG colorando le province per `owner` (colori da `popoli.json`) e scrivendo il nome al `centro`. Aprilo e verifica: nessuna provincia che attraversa un golfo o salta da una costa all'altra, confini plausibili tra i popoli, Sardegna e Corsica grigie. Correggi spostando i centri o aggiungendo `tagli`, poi rigenera.

- [ ] **Step 6: Verifica che passino**

Run: `npm test`
Expected: PASS, tutti i test.

- [ ] **Step 7: Commit**

```bash
git add data/centri.json public/data/map.json test/map.test.js
git commit -m "feat: 149 centri e mappa reale dell'Italia nel 753 a.C."
```

---

### Task 13: Bench a regole e README — *inline* (dopo il task 12)

**Files:**
- Create: `bench.js`, `README.md`
- Test: `test/bench.test.js`

**Interfaces:**
- Consumes: `loadData`, `createGame`, `advanceDay`, `rulesController`, `provincesOf`, `score`.
- Produces: `runBench({ anni, semi }) → [{ id, nome, difficolta, vivo, provinceInizio, provinceFine, punteggio }]` (medie sui semi, ordinate per punteggio decrescente); CLI `node bench.js [anni] [semi]` che stampa una tabella e la salva in `bench-regole.txt`.

- [ ] **Step 1: Scrivi il test che fallisce `test/bench.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBench } from '../bench.js';

test('il bench gira sulla mappa reale e riporta tutti i popoli', () => {
  const rows = runBench({ anni: 5, semi: 1 });
  assert.equal(rows.length, 38);
  for (const r of rows) {
    assert.ok(r.vivo >= 0 && r.vivo <= 1);
    assert.ok(Number.isFinite(r.punteggio));
  }
  const sorted = [...rows].sort((a, b) => b.punteggio - a.punteggio);
  assert.deepEqual(rows.map(r => r.id), sorted.map(r => r.id));
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../bench.js'`.

- [ ] **Step 3: Implementa `bench.js`**

```js
// Partite headless con l'IA a regole per tutti. Uso: node bench.js [anni=100] [semi=5]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadData } from './tools/load-data.js';
import { createGame } from './public/js/sim/setup.js';
import { advanceDay } from './public/js/sim/loop.js';
import { provincesOf } from './public/js/sim/state.js';
import { score } from './public/js/sim/score.js';
import { rulesController } from './public/js/ai/rules.js';

export function runBench({ anni, semi }) {
  const data = loadData();
  const info = Object.fromEntries(data.popoli.popoli.map(p => [p.id, p]));
  const acc = {};
  for (let seed = 1; seed <= semi; seed++) {
    const game = createGame({ ...data, seed });
    const controllers = Object.fromEntries(game.ordine.map(id => [id, rulesController]));
    const start = Object.fromEntries(game.ordine.map(id => [id, provincesOf(game, id).length]));
    for (let d = 0; d < anni * 365; d++) advanceDay(game, controllers);
    for (const id of game.ordine) {
      const a = (acc[id] ??= { vivo: 0, provinceInizio: 0, provinceFine: 0, punteggio: 0 });
      a.vivo += game.nazioni[id].vivo ? 1 : 0;
      a.provinceInizio += start[id];
      a.provinceFine += provincesOf(game, id).length;
      a.punteggio += score(game, id);
    }
  }
  return Object.entries(acc)
    .map(([id, a]) => ({
      id, nome: info[id].nome, difficolta: info[id].difficolta,
      vivo: a.vivo / semi, provinceInizio: a.provinceInizio / semi,
      provinceFine: a.provinceFine / semi, punteggio: a.punteggio / semi
    }))
    .sort((a, b) => b.punteggio - a.punteggio || a.id.localeCompare(b.id));
}

function table(rows, anni, semi, ms) {
  const lines = [`Bench regole: ${anni} anni, ${semi} semi, ${(ms / 1000).toFixed(1)} s`, ''];
  lines.push('popolo'.padEnd(16) + 'difficoltà'.padEnd(17) + 'vivo'.padStart(6) + 'prov. inizio'.padStart(14) + 'prov. fine'.padStart(12) + 'punteggio'.padStart(11));
  for (const r of rows) {
    lines.push(r.nome.padEnd(16) + r.difficolta.padEnd(17) + `${Math.round(r.vivo * 100)}%`.padStart(6) +
      r.provinceInizio.toFixed(1).padStart(14) + r.provinceFine.toFixed(1).padStart(12) + r.punteggio.toFixed(1).padStart(11));
  }
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const anni = Number(process.argv[2] ?? 100), semi = Number(process.argv[3] ?? 5);
  const t0 = performance.now();
  const rows = runBench({ anni, semi });
  const out = table(rows, anni, semi, performance.now() - t0);
  console.log(out);
  writeFileSync('bench-regole.txt', out + '\n');
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, tutti i test.

- [ ] **Step 5: Fai girare il bench vero e guarda i numeri**

Run: `node bench.js 100 5`
Expected: una tabella con 38 righe, in meno di qualche minuto. Annota nel messaggio di commit: tempo impiegato, posizione di Roma e dei Volsci, quanti popoli sono stati eliminati. Se nessuna guerra produce cambi di province, o se metà dei popoli sparisce in 100 anni, NON correggere qui: è materiale per la tappa 6 (taratura). Riportalo all'utente.

- [ ] **Step 6: Scrivi `README.md`**

```markdown
# Universalis Romae

Clone di Europa Universalis II ambientato nell'Italia antica (753–264 a.C.).
I popoli non giocati decidono con Jev (TypeSafe) o con un'IA a regole.

Design: `docs/superpowers/specs/2026-10-12-universalis-romae-design.md`

## Comandi

- `npm install` — dipendenze di sviluppo (solo per la mappa)
- `npm test` — tutti i test
- `npm run fetch-ne` — scarica Natural Earth in `data/ne/` (una volta)
- `npm run build-map` — rigenera `public/data/map.json` da `data/centri.json`
- `node bench.js [anni] [semi]` — partite headless con l'IA a regole, tabella in `bench-regole.txt`

## Struttura

- `public/js/sim/` — simulazione pura (nessun DOM, caso solo da `rng.js`)
- `public/js/ai/` — IA a regole (poi Jev)
- `public/data/` — mappa, popoli, bilanciamento
- `data/` — sorgenti della mappa
- `tools/` — generazione mappa e caricamento dati
```

- [ ] **Step 7: Commit**

```bash
git add bench.js README.md test/bench.test.js
git commit -m "feat: bench headless con IA a regole e README"
```

---

## Tappe successive (piani separati, da scrivere dopo questa)

2. UI giocabile (`server.js` statico, Canvas, pannelli, salvataggi).
3. Jev: proxy in `server.js`, `questions.js`, coda asincrona, pannello Consiglio, bench misto.
4. Diplomazia (alleanze, foedus, tributi, ultimatum, ambascerie), governo e slider, cultura e rivolte.
5. Eventi e popoli dormienti.
6. Taratura della difficoltà con il bench.
