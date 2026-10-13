# Tappa 4b: governo, slider, cultura, rivolte — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Governi con effetti, tre slider di riforma, malcontento e assimilazione delle province, colonie e fortificazioni, rivolte con eserciti ribelli e indipendenze; IA a regole e Jev che li usano; interfaccia per giocarli.

**Architecture:** Due moduli nuovi della simulazione: `sim/government.js` (slider) e `sim/culture.js` (malcontento, assimilazione, colonie, fortezze, rivolte, indipendenze, popoli nuovi). I ribelli sono un record speciale `ribelli` in `game.nazioni`, fuori da `game.ordine`, in guerra con tutti (caso speciale in `atWar`, battaglie e assedi). I popoli nati a metà partita entrano in `ordine` e ricevono un controller da `syncControllers`. Jev sceglie lo slider una volta l'anno con un'estrazione a temperatura 0,8 da un hash, fuori dal generatore della partita.

**Tech Stack:** Node 24 ES modules, Canvas 2D, `node --test`, playwright-core per la prova di fumo. Nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-10-12-universalis-romae-design.md`, sezione 12 (e sezione 3 per governo e cultura).

## Global Constraints

- Simulazione deterministica: ogni numero casuale della partita da `game.rng` (`nextRandom`, `rollD10`); iterazioni in ordine stabile (`game.ordine`, id ordinati).
- La scelta di Jev sullo slider NON usa `game.rng`: hash di `seq` e giorno, temperatura 0,8.
- Comandi solo da `applyCommand`; un controller comanda solo per sé.
- Stato JSON puro: niente `Infinity`, `undefined` nei campi salvati; `null` per "mai".
- `TYPESAFE_API_KEY` solo lato server; i revisori non chiamano TypeSafe.
- Slider: da −5 a +5, una mossa ogni 10 anni (repubblica 15).
- Testi del gioco in italiano; commenti nel codice in italiano, come il resto del progetto.
- Merge solo locale su main.

## Review Focus

1. **Ribelli ovunque in guerra**: ogni funzione che legge `game.nazioni[x]` per un esercito o un controllore ribelle (colori, nomi, tratti, `friendly`, `sendStrandedHome`, notizie) non deve rompersi; i ribelli non entrano mai in `ordine`, classifica, diplomazia.
2. **Popolo nato a metà partita**: controller assegnato (sessione e bench), visibile in diplomazia/classifica, salvabile e ricaricabile, bench che non si rompe su un id assente da `popoli.json`.
3. **Provincia riconquistata dai ribelli da un alleato**: torna al padrone, non all'alleato; un terzo in guerra col padrone invece la tiene.
4. **Salvataggi vecchi** (senza slider, assimilazione, ribelli): si caricano con i valori iniziali; file con `ribelli` malformato o padrone `ribelli` vengono rifiutati.
5. **Rigioco Jev**: con le domande sullo slider il rigioco di un registro resta identico (test del bench misto).

Ogni voce ha il suo test nel task che possiede il codice (Task 3: 1, 2, 3; Task 4: 4; Task 5: 5).

---

### Task 1: Governi e slider

**Files:**
- Create: `public/js/sim/government.js`, `test/government.test.js`
- Modify: `public/data/balance.json`, `public/js/sim/state.js`, `public/js/sim/economy.js`, `public/js/sim/diplomacy.js` (foedus), `public/js/sim/combat.js` (`modifier` → `battleModifier` esportato), `public/js/sim/commands.js`, `public/js/sim/setup.js`, `test/fixtures.js`, `test/views.test.js` (atteso del governo)

**Interfaces:**
- Produces: `governmentOf(game, id) → object`, `sliderOf(game, id) → {societa, guerra, governo}`, `taxBonus(game, id) → number`, `recruitBonus(game, id) → number` (state.js); `SLIDER`, `initGovernment(game)`, `sliderInterval(game, id) → giorni`, `checkSlider(game, id, quale, verso) → string|null`, `moveSlider(game, id, quale, verso) → {ok, motivo?}` (government.js); `battleModifier(game, prov, side) → number` (combat.js); comando `{ tipo: 'slider', nazione, quale, verso }`.

- [ ] **Step 1: balance.json** — aggiungere i blocchi (e `stabilitaDado` in `combattimento`):

```json
  "governi": {
    "tribù": { "tasse": -0.2, "reclute": 0.2 },
    "monarchia": { "equilibrioStabilita": 1 },
    "repubblica": { "tasse": 0.1, "intervalloSlider": 15 },
    "lega": { "foedusRapporto": 2 },
    "città-stato": { "tasse": 0.2, "reclute": -0.2 }
  },
  "slider": {
    "intervalloAnni": 10, "limite": 5, "tassePatrizi": 0.02, "reclutePlebe": 0.03,
    "estremoGuerra": 4, "assimilazioneAccentramento": 0.1, "malcontentoAccentramento": 0.2
  },
```
e in `combattimento`: `"stabilitaDado": 2`.

- [ ] **Step 2: fixture neutra** — in `test/fixtures.js` la funzione `N` usa `governo: 'neutro'` (governo senza voce in `governi`, quindi senza effetti), con il commento `// governo senza effetti: i conti dei test delle tappe precedenti restano validi`. In `test/views.test.js` l'atteso del test `governo` usa `governo: 'neutro'` (il resto dell'atteso si aggiorna nel Task 6).

- [ ] **Step 3: test che falliscono** — `test/government.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { maxManpower, createArmy } from '../public/js/sim/state.js';
import { monthlyIncome, monthlyManpower, yearlyUpdate } from '../public/js/sim/economy.js';
import { checkSlider, moveSlider } from '../public/js/sim/government.js';
import { checkProposal, changeRelation } from '../public/js/sim/diplomacy.js';
import { battleModifier } from '../public/js/sim/combat.js';
import { applyCommand } from '../public/js/sim/commands.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('governo: tribù e città-stato cambiano tasse e reclute', () => {
  const g = makeGame();
  const tasse = monthlyIncome(g, 'roma'), uomini = monthlyManpower(g, 'roma'), max = maxManpower(g, 'roma');
  g.nazioni.roma.governo = 'tribù';
  close(monthlyIncome(g, 'roma'), tasse * 0.8);
  assert.equal(monthlyManpower(g, 'roma'), Math.round(6 * 25 * (1 + 0.3 + 0.2)));
  assert.equal(maxManpower(g, 'roma'), Math.round(6 * 500 * 1.5));
  g.nazioni.roma.governo = 'città-stato';
  close(monthlyIncome(g, 'roma'), tasse * 1.2);
  assert.ok(monthlyManpower(g, 'roma') < uomini && maxManpower(g, 'roma') < max);
});

test('governo: la monarchia tende a stabilità +1', () => {
  const g = makeGame();
  g.nazioni.roma.governo = 'monarchia';
  g.nazioni.latini.governo = 'monarchia';
  g.nazioni.latini.stabilita = 3;
  for (let i = 0; i < 80; i++) yearlyUpdate(g);
  assert.equal(g.nazioni.roma.stabilita, 1);
  assert.equal(g.nazioni.latini.stabilita, 1);
});

test('governo: la lega chiede il foedus con forza doppia invece che tripla', () => {
  const g = makeGame();
  changeRelation(g, 'roma', 'latini', 100);
  g.nazioni.latini.uomini = 0;
  for (const a of Object.values(g.eserciti)) if (a.owner === 'latini') { a.fanteria = 1000; a.cavalleria = 0; }
  for (const a of Object.values(g.eserciti)) if (a.owner === 'roma') { a.fanteria = 2500 - g.nazioni.roma.uomini * 0.5; a.cavalleria = 0; }
  assert.equal(checkProposal(g, 'roma', 'foedus', 'latini'), 'non abbastanza più forte');
  g.nazioni.roma.governo = 'lega';
  assert.equal(checkProposal(g, 'roma', 'foedus', 'latini'), null);
});

test('slider: una mossa ogni 10 anni (15 per la repubblica), entro ±5', () => {
  const g = makeGame();
  assert.equal(checkSlider(g, 'roma', 'boh', 1), 'slider sconosciuto');
  assert.equal(checkSlider(g, 'roma', 'guerra', 2), 'verso non valido');
  assert.deepEqual(moveSlider(g, 'roma', 'guerra', 1), { ok: true });
  assert.equal(g.nazioni.roma.slider.guerra, 1);
  assert.equal(checkSlider(g, 'roma', 'societa', -1), 'prossima riforma tra 10 anni');
  g.day += 3650;
  assert.equal(checkSlider(g, 'roma', 'societa', -1), null);
  g.nazioni.roma.governo = 'repubblica';
  assert.equal(checkSlider(g, 'roma', 'societa', -1), 'prossima riforma tra 5 anni');
  g.nazioni.roma.slider.guerra = 5;
  g.nazioni.roma.ultimoSlider = null;
  assert.equal(checkSlider(g, 'roma', 'guerra', 1), 'già al limite');
  assert.equal(checkSlider(g, 'ribelli', 'guerra', 1), 'nazione inesistente');
});

test('slider della società: patrizi +2% tasse, plebe +3% reclute per punto', () => {
  const g = makeGame();
  const tasse = monthlyIncome(g, 'roma');
  g.nazioni.roma.slider.societa = -5;
  close(monthlyIncome(g, 'roma'), tasse * 1.1);
  g.nazioni.roma.slider.societa = 4;
  close(monthlyIncome(g, 'roma'), tasse);
  assert.equal(monthlyManpower(g, 'roma'), Math.round(6 * 25 * (1 + 0.3 + 0.12)));
});

test('dado: stabilità ±2 vale ±1, slider di guerra agli estremi +1 in attacco o in difesa', () => {
  const g = makeGame();
  const a = createArmy(g, 'roma', 'c', 1000, 0); // c è dei volsci: roma attacca
  const prov = g.province.c;
  const base = battleModifier(g, prov, [a]);
  g.nazioni.roma.stabilita = 2;
  assert.equal(battleModifier(g, prov, [a]), base + 1);
  g.nazioni.roma.stabilita = -2;
  assert.equal(battleModifier(g, prov, [a]), base - 1);
  g.nazioni.roma.stabilita = 0;
  g.nazioni.roma.slider.guerra = 4;
  assert.equal(battleModifier(g, prov, [a]), base + 1);
  g.nazioni.roma.slider.guerra = -5;
  assert.equal(battleModifier(g, prov, [a]), base);
  const d = createArmy(g, 'volsci', 'c', 1000, 0);
  const dBase = battleModifier(g, prov, [d]);
  g.nazioni.volsci.slider.guerra = -4;
  assert.equal(battleModifier(g, prov, [d]), dBase + 1);
});

test('comando slider', () => {
  const g = makeGame();
  assert.deepEqual(applyCommand(g, { tipo: 'slider', nazione: 'roma', quale: 'governo', verso: -1 }), { ok: true });
  assert.equal(g.nazioni.roma.slider.governo, -1);
  assert.equal(g.nazioni.roma.ultimoSlider, 0);
  assert.equal(applyCommand(g, { tipo: 'slider', nazione: 'roma', quale: 'governo', verso: -1 }).ok, false);
});
```

- [ ] **Step 4: verificare che falliscano** — Run: `node --test test/government.test.js`. Expected: FAIL (`government.js` non esiste).

- [ ] **Step 5: state.js** — aggiungere dopo `clamp`, e usare `recruitBonus` in `maxManpower`:

```js
// Effetti del governo (balance.governi): un governo senza voce non ha effetti.
export function governmentOf(game, id) {
  return game.balance.governi?.[game.nazioni[id].governo] ?? {};
}

export function sliderOf(game, id) {
  return game.nazioni[id].slider ?? { societa: 0, guerra: 0, governo: 0 };
}

// Bonus sulle tasse: governo e patrizi (slider della società negativo).
export function taxBonus(game, id) {
  return (governmentOf(game, id).tasse || 0) + Math.max(0, -sliderOf(game, id).societa) * game.balance.slider.tassePatrizi;
}

// Bonus sulle reclute: tratto, governo e plebe (slider della società positivo).
export function recruitBonus(game, id) {
  return (game.nazioni[id].tratti.reclute || 0) + (governmentOf(game, id).reclute || 0) +
    Math.max(0, sliderOf(game, id).societa) * game.balance.slider.reclutePlebe;
}
```
`maxManpower`: `... * game.balance.economia.uominiMax * (1 + recruitBonus(game, nationId)))`. `maxManpower` deve stare dopo le nuove funzioni o usarle (le dichiarazioni di funzione sono sollevate: va bene in qualunque ordine).

- [ ] **Step 6: government.js**

```js
// Governo e slider: tre leve da −5 a +5, una mossa ogni 10 anni (15 per le repubbliche).
import { governmentOf, sliderOf } from './state.js';

export const SLIDER = ['societa', 'guerra', 'governo'];

// Valori iniziali; non tocca quelli già presenti (salvataggi vecchi, popoli nuovi).
export function initGovernment(game) {
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    n.slider ??= { societa: 0, guerra: 0, governo: 0 };
    n.ultimoSlider ??= null;
  }
}

export function sliderInterval(game, id) {
  return 365 * (governmentOf(game, id).intervalloSlider ?? game.balance.slider.intervalloAnni);
}

export function checkSlider(game, id, quale, verso) {
  const n = game.nazioni[id];
  if (!n?.vivo || !game.ordine.includes(id)) return 'nazione inesistente';
  if (!SLIDER.includes(quale)) return 'slider sconosciuto';
  if (verso !== 1 && verso !== -1) return 'verso non valido';
  if (Math.abs(sliderOf(game, id)[quale] + verso) > game.balance.slider.limite) return 'già al limite';
  if (n.ultimoSlider !== null && n.ultimoSlider !== undefined) {
    const resta = n.ultimoSlider + sliderInterval(game, id) - game.day;
    if (resta > 0) return `prossima riforma tra ${Math.ceil(resta / 365)} anni`;
  }
  return null;
}

export function moveSlider(game, id, quale, verso) {
  const err = checkSlider(game, id, quale, verso);
  if (err) return { ok: false, motivo: err };
  const n = game.nazioni[id];
  n.slider = { ...sliderOf(game, id) };
  n.slider[quale] += verso;
  n.ultimoSlider = game.day;
  return { ok: true };
}
```

- [ ] **Step 7: economia, foedus, dado, comando, setup**
  - `economy.js`: `monthlyIncome` moltiplica anche per `(1 + taxBonus(game, id))`; `monthlyManpower` usa `(1 + recruitBonus(game, id))` al posto di `(1 + (n.tratti.reclute || 0))`; in `yearlyUpdate` la stabilità tende a `eq = governmentOf(game, id).equilibrioStabilita ?? 0` (`n.stabilita < eq` sale, `n.stabilita > eq` scende) e il commento diventa `// La stabilità tende all'equilibrio del governo (0, +1 per la monarchia): ...`.
  - `diplomacy.js` foedus: `const rapporto = governmentOf(game, from).foedusRapporto ?? d.foedusRapporto;` e `if (power(game, from) < rapporto * power(game, to))`.
  - `combat.js`: `modifier` diventa `export function battleModifier` (e le due chiamate in `battleDay`):

```js
export function battleModifier(game, prov, side) {
  const owner = side[0].owner, n = game.nazioni[owner], t = n.tratti, c = game.balance.combattimento;
  let m = t.battaglia || 0;
  const controlla = side.some(a => a.owner === prov.controller);
  if (controlla) m += c.terreno[prov.terreno];
  if (prov.terreno === 'montagna') m += t.montagna || 0;
  if (n.stabilita >= c.stabilitaDado) m += 1;
  else if (n.stabilita <= -c.stabilitaDado) m -= 1;
  const g = sliderOf(game, owner).guerra, e = game.balance.slider.estremoGuerra;
  if (g >= e && !controlla) m += 1; // dottrina offensiva: meglio in terra nemica
  if (g <= -e && controlla) m += 1; // dottrina difensiva: meglio in casa
  return m;
}
```
  - `commands.js`: `case 'slider': return moveSlider(game, cmd.nazione, cmd.quale, cmd.verso);`
  - `setup.js`: `initGovernment(game)` dopo `initDiplomacy(game)`; la cavalleria/fanteria iniziale usa `const bonus = 1 + recruitBonus(game, id);`; aggiornare il commento dello stato con `slider: { societa, guerra, governo }, ultimoSlider`.

- [ ] **Step 8: verificare** — Run: `node --test test/government.test.js`. Expected: 7/7 PASS. Run: `npm test > .superpowers/sdd/2026-10-13-tappa-4b-governo-cultura/t1.log 2>&1; tail -5` del log. Expected: tutto verde (194). Se un test vecchio cade per il dado della stabilità (una guerra senza pretesto porta l'attaccante a −2), si corregge l'atteso solo se il test misura altro dal dado, con una riga `Ruling:` nel registro.

- [ ] **Step 9: commit** — `git add -A && git commit -m "feat: governi con effetti, slider di riforma, stabilità e dottrina nel dado"`.

---

### Task 2: Cultura, assimilazione, colonie, fortificazioni

**Files:**
- Create: `public/js/sim/culture.js`, `test/culture.test.js`
- Modify: `public/data/balance.json`, `public/js/sim/loop.js`, `public/js/sim/commands.js`, `public/js/sim/setup.js`

**Interfaces:**
- Consumes: `sliderOf` (Task 1).
- Produces: `initCulture(game)`, `malcontent(game, provId) → 0..10`, `assimilationRate(game, provId) → punti/mese`, `hasColony(p) → bool`, `colonyCost(game, provId)`, `checkColony(game, id, provId) → string|null`, `foundColony(game, id, provId)`, `fortCost(game, provId) → number|null`, `checkFortify(game, id, provId) → string|null`, `fortify(game, id, provId)`, `monthlyCulture(game)`; comandi `{ tipo: 'colonia', nazione, provincia }`, `{ tipo: 'fortifica', nazione, provincia }`; campi provincia `assimilazione`, `assimilazioneDi`, `colonia` (id del fondatore o `null`), `ribelliDal` (`null`).

- [ ] **Step 1: balance.json**

```json
  "cultura": {
    "anniAssimilazione": 15, "malcontentoCultura": 3, "malcontentoColonia": 1,
    "sogliaRivolta": 3, "rivoltaPerPunto": 0.01, "ribelliPerUomo": 400, "anniIndipendenza": 1,
    "coloniaCostoBase": 10, "coloniaCostoPerTassa": 3, "coloniaUomini": 1000,
    "fortificazioneCosti": [15, 30, 60], "fortMax": 3
  },
```

- [ ] **Step 2: test che falliscono** — `test/culture.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { malcontent, assimilationRate, monthlyCulture, colonyCost, checkColony, checkFortify, fortCost } from '../public/js/sim/culture.js';
import { advanceDay } from '../public/js/sim/loop.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('malcontento: cultura diversa, stabilità negativa, accentramento, colonia', () => {
  const g = makeGame();
  assert.equal(malcontent(g, 'b'), 0);
  g.province.b.cultura = 'volsca';
  assert.equal(malcontent(g, 'b'), 3);
  g.nazioni.roma.stabilita = -2;
  assert.equal(malcontent(g, 'b'), 5);
  g.nazioni.roma.slider.governo = -5;
  assert.equal(malcontent(g, 'b'), 6);
  g.nazioni.roma.slider.governo = 5;
  assert.equal(malcontent(g, 'b'), 4);
  g.province.b.colonia = 'roma';
  assert.equal(malcontent(g, 'b'), 3);
  g.province.b.colonia = 'volsci'; // la colonia di un padrone vecchio non conta
  assert.equal(malcontent(g, 'b'), 4);
});

test('assimilazione: circa 15 anni, più veloce con accentramento, tratto e colonia', () => {
  const g = makeGame();
  close(assimilationRate(g, 'b'), 100 / 180);
  g.nazioni.roma.slider.governo = -5;
  close(assimilationRate(g, 'b'), 100 / 180 * 1.5);
  g.nazioni.roma.tratti.assimilazione = 0.5;
  g.province.b.colonia = 'roma';
  close(assimilationRate(g, 'b'), 100 / 180 * 1.5 * 1.5 * 2);
  g.nazioni.roma.slider.governo = 5;
  g.nazioni.roma.tratti.assimilazione = 0;
  g.province.b.colonia = null;
  close(assimilationRate(g, 'b'), 100 / 180 * 0.5);
});

test('ogni mese la provincia straniera si assimila; a 100 prende la cultura del padrone', () => {
  const g = makeGame();
  g.province.b.cultura = 'volsca';
  for (let i = 0; i < 179; i++) monthlyCulture(g);
  assert.equal(g.province.b.cultura, 'volsca');
  assert.ok(g.province.b.assimilazione > 99);
  monthlyCulture(g);
  assert.equal(g.province.b.cultura, 'latina');
  assert.equal(g.province.b.assimilazione, 0);
  assert.ok(g.log.some(e => e.tipo === 'assimilata' && e.prov === 'b'));
});

test('l\'assimilazione si azzera quando la provincia cambia padrone, e si ferma se è occupata', () => {
  const g = makeGame();
  g.province.b.cultura = 'volsca';
  for (let i = 0; i < 12; i++) monthlyCulture(g);
  const dopoUnAnno = g.province.b.assimilazione;
  g.province.b.controller = 'volsci';
  monthlyCulture(g);
  assert.equal(g.province.b.assimilazione, dopoUnAnno);
  g.province.b.owner = 'latini';
  g.province.b.controller = 'latini';
  monthlyCulture(g);
  close(g.province.b.assimilazione, assimilationRate(g, 'b'));
  assert.equal(g.province.b.assimilazioneDi, 'latini');
});

test('colonia: costa denaro e uomini, solo in provincia propria di altra cultura', () => {
  const g = makeGame();
  const n = g.nazioni.roma;
  assert.equal(checkColony(g, 'roma', 'b'), 'è già della tua cultura');
  assert.equal(checkColony(g, 'roma', 'c'), 'provincia non tua');
  g.province.b.cultura = 'volsca';
  assert.equal(colonyCost(g, 'b'), 10 + 3 * 2);
  n.tesoro = 0;
  assert.equal(checkColony(g, 'roma', 'b'), 'denaro insufficiente');
  n.tesoro = 100; n.uomini = 999;
  assert.equal(checkColony(g, 'roma', 'b'), 'uomini insufficienti');
  n.uomini = 1500;
  assert.deepEqual(applyCommand(g, { tipo: 'colonia', nazione: 'roma', provincia: 'b' }), { ok: true });
  assert.equal(g.province.b.colonia, 'roma');
  assert.equal(n.tesoro, 84);
  assert.equal(n.uomini, 500);
  assert.equal(checkColony(g, 'roma', 'b'), 'colonia già fondata');
});

test('fortificazione: livelli fino a 3, costo crescente', () => {
  const g = makeGame();
  const n = g.nazioni.roma;
  n.tesoro = 200;
  assert.equal(fortCost(g, 'b'), 15);
  assert.deepEqual(applyCommand(g, { tipo: 'fortifica', nazione: 'roma', provincia: 'b' }), { ok: true });
  assert.equal(g.province.b.fort, 1);
  assert.equal(n.tesoro, 185);
  applyCommand(g, { tipo: 'fortifica', nazione: 'roma', provincia: 'b' });
  applyCommand(g, { tipo: 'fortifica', nazione: 'roma', provincia: 'b' });
  assert.equal(g.province.b.fort, 3);
  assert.equal(n.tesoro, 200 - 15 - 30 - 60);
  assert.equal(fortCost(g, 'b'), null);
  assert.equal(checkFortify(g, 'roma', 'b'), 'fortificazione al massimo');
  assert.equal(checkFortify(g, 'roma', 'c'), 'provincia non tua');
  n.tesoro = 0;
  assert.equal(checkFortify(g, 'roma', 'a'), 'denaro insufficiente');
});

test('il ciclo del giorno fa girare la cultura il primo del mese', () => {
  const g = makeGame();
  g.province.b.cultura = 'volsca';
  for (let i = 0; i < 40; i++) advanceDay(g);
  assert.ok(g.province.b.assimilazione > 0);
});
```

- [ ] **Step 3: verificare che falliscano** — Run: `node --test test/culture.test.js`. Expected: FAIL (`culture.js` non esiste).

- [ ] **Step 4: culture.js** (prima parte; la seconda arriva nel Task 3)

```js
// Cultura delle province: malcontento, assimilazione, colonie, fortificazioni; rivolte e indipendenze.
import { clamp, log, sliderOf } from './state.js';

const C = game => game.balance.cultura;

// Valori iniziali dei campi di provincia; non tocca quelli già presenti (salvataggi vecchi).
export function initCulture(game) {
  for (const p of Object.values(game.province)) {
    p.assimilazione ??= 0;
    p.assimilazioneDi ??= p.owner;
    p.colonia ??= null;
    p.ribelliDal ??= null;
  }
}

// Una colonia conta solo per chi l'ha fondata e possiede ancora la provincia.
export function hasColony(p) {
  return p.colonia !== null && p.colonia === p.owner;
}

// 0-10: cultura diversa dal padrone, stabilità negativa, accentramento (slider di governo negativo), colonia.
export function malcontent(game, provId) {
  const p = game.province[provId], n = game.nazioni[p.owner], c = C(game);
  let m = p.cultura !== n.cultura ? c.malcontentoCultura : 0;
  m += Math.max(0, -n.stabilita);
  m -= sliderOf(game, p.owner).governo * game.balance.slider.malcontentoAccentramento;
  if (hasColony(p)) m -= c.malcontentoColonia;
  return clamp(Math.round(m * 10) / 10, 0, 10);
}

// Punti di assimilazione al mese; a 100 la provincia prende la cultura del padrone.
export function assimilationRate(game, provId) {
  const p = game.province[provId], n = game.nazioni[p.owner];
  const base = 100 / (C(game).anniAssimilazione * 12);
  const leva = Math.max(0, 1 - sliderOf(game, p.owner).governo * game.balance.slider.assimilazioneAccentramento);
  return base * (1 + (n.tratti.assimilazione || 0)) * leva * (hasColony(p) ? 2 : 1);
}

export function colonyCost(game, provId) {
  const c = C(game);
  return c.coloniaCostoBase + c.coloniaCostoPerTassa * game.province[provId].tasse;
}

function ownProvince(game, id, provId) {
  const n = game.nazioni[id], p = game.province[provId];
  if (!n?.vivo || !game.ordine.includes(id)) return 'nazione inesistente';
  if (!p || p.owner !== id || p.controller !== id) return 'provincia non tua';
  return null;
}

export function checkColony(game, id, provId) {
  const err = ownProvince(game, id, provId);
  if (err) return err;
  const n = game.nazioni[id], p = game.province[provId];
  if (p.cultura === n.cultura) return 'è già della tua cultura';
  if (hasColony(p)) return 'colonia già fondata';
  if (n.tesoro < colonyCost(game, provId)) return 'denaro insufficiente';
  if (n.uomini < C(game).coloniaUomini) return 'uomini insufficienti';
  return null;
}

export function foundColony(game, id, provId) {
  const err = checkColony(game, id, provId);
  if (err) return { ok: false, motivo: err };
  const n = game.nazioni[id];
  n.tesoro -= colonyCost(game, provId);
  n.uomini -= C(game).coloniaUomini;
  game.province[provId].colonia = id;
  log(game, { tipo: 'colonia', prov: provId, nazione: id });
  return { ok: true };
}

export function fortCost(game, provId) {
  const c = C(game), f = game.province[provId].fort;
  return f >= c.fortMax ? null : c.fortificazioneCosti[f];
}

export function checkFortify(game, id, provId) {
  const err = ownProvince(game, id, provId);
  if (err) return err;
  const costo = fortCost(game, provId);
  if (costo === null) return 'fortificazione al massimo';
  if (game.nazioni[id].tesoro < costo) return 'denaro insufficiente';
  return null;
}

export function fortify(game, id, provId) {
  const err = checkFortify(game, id, provId);
  if (err) return { ok: false, motivo: err };
  game.nazioni[id].tesoro -= fortCost(game, provId);
  game.province[provId].fort += 1;
  return { ok: true };
}

// Ogni mese, in ordine di id: assimilazione (solo se il padrone controlla la provincia).
export function monthlyCulture(game) {
  for (const id of Object.keys(game.province).sort()) {
    const p = game.province[id], n = game.nazioni[p.owner];
    if (!n.vivo) continue;
    if (p.assimilazioneDi !== p.owner) { p.assimilazione = 0; p.assimilazioneDi = p.owner; }
    if (p.cultura !== n.cultura && p.controller === p.owner) {
      p.assimilazione = Math.min(100, p.assimilazione + assimilationRate(game, id));
      if (p.assimilazione >= 100 - 1e-9) {
        p.cultura = n.cultura;
        p.assimilazione = 0;
        log(game, { tipo: 'assimilata', prov: id, nazione: p.owner });
      }
    }
  }
}
```

- [ ] **Step 5: collegamenti** — `commands.js`: `case 'colonia': return foundColony(game, cmd.nazione, cmd.provincia);` e `case 'fortifica': return fortify(game, cmd.nazione, cmd.provincia);`. `loop.js`: `if (isFirstOfMonth(game.day)) { monthlyEconomy(game); monthlyDiplomacy(game); monthlyCulture(game); }` e il commento in cima nomina la cultura. `setup.js`: `initCulture(game)` dopo `initGovernment(game)`; commento dello stato con i quattro campi di provincia.

- [ ] **Step 6: verificare** — Run: `node --test test/culture.test.js`. Expected: 7/7 PASS. Run: `npm test` nel log del task, tail. Expected: verde (201).

- [ ] **Step 7: commit** — `git commit -am "feat: malcontento, assimilazione, colonie e fortificazioni"` (con `git add` dei file nuovi).

---

### Task 3: Rivolte, ribelli, indipendenze, popoli nuovi

**Files:**
- Create: `test/rebels.test.js`
- Modify: `public/js/sim/state.js` (`RIBELLI`), `public/js/sim/war.js` (`atWar`, `sendStrandedHome`), `public/js/sim/combat.js` (lati con i ribelli), `public/js/sim/siege.js`, `public/js/sim/culture.js` (rivolte, indipendenze, `spawnNation`, `ensureRebels`), `public/js/ai/modes.js` (`syncControllers`), `public/js/ai/rules.js` (`armyOrders`), `public/js/ui/session.js`, `bench.js`, `test/bench.test.js`

**Interfaces:**
- Consumes: `malcontent`, `initCulture` (Task 2), `initGovernment` (Task 1).
- Produces: `RIBELLI = 'ribelli'` (state.js); `ensureRebels(game)`, `independence(game, provId)`, `spawnNation(game, provId) → id` (culture.js); `syncControllers(out, game, ia, ai, escludi) → out` (modes.js); voci di log `rivolta {prov, nazione}`, `indipendenza {prov, da, a}`.

- [ ] **Step 1: test che falliscono** — `test/rebels.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { loadData } from '../tools/load-data.js';
import { RIBELLI, createArmy, armiesOf, provincesOf } from '../public/js/sim/state.js';
import { atWar, declareWar } from '../public/js/sim/war.js';
import { resolveBattles } from '../public/js/sim/combat.js';
import { advanceSieges } from '../public/js/sim/siege.js';
import { monthlyCulture, ensureRebels, independence } from '../public/js/sim/culture.js';
import { armyOrders, rulesController } from '../public/js/ai/rules.js';
import { createSession, runDays } from '../public/js/ui/session.js';

function conBilancio(g) { g.balance = structuredClone(g.balance); return g; }
function soloRibelli(g, prov, uomini = 2000) {
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  ensureRebels(g);
  return createArmy(g, RIBELLI, prov, uomini, 0);
}

test('rivolta: oltre la soglia nasce un esercito ribelle nella provincia', () => {
  const g = conBilancio(makeGame());
  g.province.b.cultura = 'volsca';
  monthlyCulture(g); // malcontento 3: niente rivolta
  assert.ok(!Object.values(g.eserciti).some(a => a.owner === RIBELLI));
  g.nazioni.roma.stabilita = -1;
  g.balance.cultura.rivoltaPerPunto = 1; // certa
  monthlyCulture(g);
  const r = Object.values(g.eserciti).filter(a => a.owner === RIBELLI);
  assert.equal(r.length, 1);
  assert.equal(r[0].prov, 'b');
  assert.equal(r[0].fanteria, 2 * 400);
  assert.ok(g.log.some(e => e.tipo === 'rivolta' && e.prov === 'b' && e.nazione === 'roma'));
  monthlyCulture(g); // un esercito ribelle già presente: nessuna seconda rivolta
  assert.equal(Object.values(g.eserciti).filter(a => a.owner === RIBELLI).length, 1);
  assert.equal(g.ordine.includes(RIBELLI), false);
});

test('i ribelli sono in guerra con tutti, combattono e si sciolgono se battuti', () => {
  const g = makeGame();
  assert.equal(atWar(g, 'roma', RIBELLI), true);
  assert.equal(atWar(g, RIBELLI, RIBELLI), false);
  soloRibelli(g, 'b', 500);
  createArmy(g, 'roma', 'b', 5000, 0);
  for (let i = 0; i < 100 && armiesOf(g, RIBELLI).length; i++) resolveBattles(g);
  assert.equal(armiesOf(g, RIBELLI).length, 0);
});

test('un alleato combatte i ribelli insieme al padrone', () => {
  const g = makeGame();
  soloRibelli(g, 'b', 3000);
  g.nazioni.roma.alleati.push('latini'); g.nazioni.latini.alleati.push('roma');
  const r = createArmy(g, 'roma', 'b', 1000, 0), l = createArmy(g, 'latini', 'b', 1000, 0);
  resolveBattles(g);
  assert.equal(r.inBattaglia, true);
  assert.equal(l.inBattaglia, true);
});

test('assedio dei ribelli; riconquista: al padrone se la libera un alleato, al nemico del padrone se la prende lui', () => {
  const g = makeGame();
  const ribelli = soloRibelli(g, 'b', 20000);
  for (let i = 0; i < 2000 && g.province.b.controller !== RIBELLI; i++) { g.day++; advanceSieges(g); }
  assert.equal(g.province.b.controller, RIBELLI);
  assert.equal(g.province.b.ribelliDal, g.day);
  delete g.eserciti[ribelli.id];
  g.nazioni.roma.alleati.push('latini'); g.nazioni.latini.alleati.push('roma');
  createArmy(g, 'latini', 'b', 20000, 0);
  for (let i = 0; i < 2000 && g.province.b.controller === RIBELLI; i++) advanceSieges(g);
  assert.equal(g.province.b.controller, 'roma');
  assert.equal(g.province.b.ribelliDal, null);
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  g.province.b.controller = RIBELLI;
  declareWar(g, 'volsci', 'roma');
  createArmy(g, 'volsci', 'b', 20000, 0);
  for (let i = 0; i < 2000 && g.province.b.controller === RIBELLI; i++) advanceSieges(g);
  assert.equal(g.province.b.controller, 'volsci');
});

test('indipendenza dopo un anno: va al vicino della stessa cultura', () => {
  const g = makeGame();
  const r = soloRibelli(g, 'b');
  g.day = 1000;
  g.province.b.controller = RIBELLI;
  g.province.b.ribelliDal = 1000 - 365;
  monthlyCulture(g);
  assert.equal(g.province.b.owner, 'latini'); // b è latina e confina con i latini (e)
  assert.equal(g.province.b.controller, 'latini');
  assert.equal(g.eserciti[r.id].owner, 'latini');
  assert.ok(g.log.some(e => e.tipo === 'indipendenza' && e.prov === 'b' && e.da === 'roma' && e.a === 'latini'));
});

test('indipendenza senza vicini della stessa cultura: nasce un popolo nuovo, con tregua', () => {
  const g = makeGame();
  const r = soloRibelli(g, 'b');
  g.province.b.cultura = 'etrusca';
  g.province.b.controller = RIBELLI;
  independence(g, 'b');
  const nuovo = g.province.b.owner;
  assert.match(nuovo, /^liberi_b_\d+$/);
  const n = g.nazioni[nuovo];
  assert.equal(n.nome, 'Liberi di B');
  assert.equal(n.cultura, 'etrusca');
  assert.equal(n.capitale, 'b');
  assert.equal(n.vivo, true);
  assert.ok(g.ordine.includes(nuovo));
  assert.deepEqual(n.slider, { societa: 0, guerra: 0, governo: 0 });
  assert.equal(typeof n.relazioni.roma, 'number');
  assert.equal(typeof g.nazioni.roma.relazioni[nuovo], 'number');
  assert.ok(n.tregue.roma > g.day && g.nazioni.roma.tregue[nuovo] > g.day);
  assert.equal(g.eserciti[r.id].owner, nuovo);
  assert.equal(provincesOf(g, nuovo).length, 1);
});

test('l\'ultima provincia persa per indipendenza elimina il popolo', () => {
  const g = makeGame();
  soloRibelli(g, 'g');
  g.province.g.controller = RIBELLI;
  independence(g, 'g');
  assert.equal(g.nazioni.siculi.vivo, false);
});

test('regole: in pace gli eserciti vanno contro i ribelli nelle proprie terre', () => {
  const g = makeGame();
  ensureRebels(g);
  createArmy(g, RIBELLI, 'b', 500, 0);
  const cmds = armyOrders(g, 'roma');
  assert.ok(cmds.some(c => c.tipo === 'muovi' && c.verso === 'b'), JSON.stringify(cmds));
});

test('un popolo nato a metà partita riceve un controller', () => {
  const s = createSession(loadData(), 'roma', 1);
  const p = Object.values(s.game.province).find(x => x.owner !== 'roma' && provincesOf(s.game, x.owner).length > 1);
  p.cultura = 'nessuna_cultura';
  ensureRebels(s.game);
  p.controller = RIBELLI;
  independence(s.game, p.id);
  const nuovo = p.owner;
  runDays(s, 1);
  assert.equal(s.controllers[nuovo], rulesController);
});
```

- [ ] **Step 2: verificare che falliscano** — Run: `node --test test/rebels.test.js`. Expected: FAIL (`RIBELLI`/`ensureRebels` non esportati).

- [ ] **Step 3: state.js e war.js**
  - `state.js`: `export const RIBELLI = 'ribelli'; // popolo speciale: in guerra con tutti, fuori da game.ordine`.
  - `war.js` `atWar`:

```js
export function atWar(game, a, b) {
  if (a === b) return false;
  if (a === RIBELLI || b === RIBELLI) return true; // i ribelli sono in guerra con tutti
  return warBetween(game, a, b) !== null;
}
```
  - `sendStrandedHome`: saltare gli eserciti ribelli (`if (a.owner === RIBELLI) continue;`).

- [ ] **Step 4: combat.js** — in `resolveBattles`, dopo `if (!enemy) continue;`:

```js
    if (first.owner === RIBELLI || enemy.owner === RIBELLI) {
      // contro i ribelli combatte chi li ha trovati, insieme ai suoi amici
      const altro = first.owner === RIBELLI ? enemy.owner : first.owner;
      battleDay(game, provId, armies.filter(x => x.owner === RIBELLI),
        armies.filter(x => x.owner === altro || (x.owner !== RIBELLI && friendly(game, x.owner, altro))));
      continue;
    }
```
(import `friendly` da `diplomacy.js`, `RIBELLI` da `state.js`). La ritirata dei ribelli non trova mai una provincia propria: l'esercito sconfitto si scioglie (comportamento esistente di `retreat`).

- [ ] **Step 5: siege.js** — il blocco della conquista diventa:

```js
    if (nextRandom(game) < siegeChance(game, a, p)) {
      if (a.owner === RIBELLI) {
        p.controller = RIBELLI;
        p.ribelliDal = game.day;
      } else {
        // chi toglie una provincia ai ribelli la rende al padrone, a meno di essere in guerra con lui
        p.controller = p.controller === RIBELLI && !atWar(game, a.owner, p.owner) ? p.owner : a.owner;
        p.ribelliDal = null;
      }
      log(game, { tipo: 'assedio', prov: p.id, nazione: a.owner });
    }
```

- [ ] **Step 6: culture.js** — import aggiuntivi: `RIBELLI, createArmy, newId` da `state.js`, `nextRandom` da `rng.js`, `initDiplomacy` da `diplomacy.js`, `initGovernment` da `government.js`, `checkSurvival, sendStrandedHome` da `war.js`. Aggiungere:

```js
const COLORI = ['#7a5c8e', '#4f7f6b', '#a0663a', '#5d6f9e', '#8e5a5a', '#6b8e3f', '#9e8a4f', '#4f8e8e'];

// Il record dei ribelli nasce alla prima rivolta: ha i campi che la simulazione legge di ogni popolo.
export function ensureRebels(game) {
  game.nazioni[RIBELLI] ??= {
    id: RIBELLI, nome: 'Ribelli', colore: '#2b2b2b', cultura: '', governo: '', capitale: null,
    tesoro: 0, uomini: 0, stabilita: 0, infamia: 0, tratti: {}, vivo: true, tregue: {}, obiettivo: null,
    relazioni: {}, alleati: [], protettore: null, tributo: null, pretesti: {}, ambascerie: {}, ultimatumInviati: {}
  };
}

function maybeRevolt(game, provId) {
  const p = game.province[provId], c = C(game);
  if (p.controller !== p.owner) return;
  if (Object.values(game.eserciti).some(a => a.prov === provId && a.owner === RIBELLI)) return;
  const m = malcontent(game, provId);
  if (m <= c.sogliaRivolta) return;
  if (nextRandom(game) >= (m - c.sogliaRivolta) * c.rivoltaPerPunto) return;
  ensureRebels(game);
  createArmy(game, RIBELLI, provId, p.uomini * c.ribelliPerUomo, 0);
  log(game, { tipo: 'rivolta', prov: provId, nazione: p.owner });
}

// Popolo nuovo nato da una provincia indipendente: cultura della provincia, capitale lì, tribù.
export function spawnNation(game, provId) {
  const p = game.province[provId], b = game.balance;
  const id = newId(game, `liberi_${provId}_`);
  game.nazioni[id] = {
    id, nome: `Liberi di ${p.nome}`, colore: COLORI[game.ordine.length % COLORI.length],
    cultura: p.cultura, governo: 'tribù', capitale: provId,
    tesoro: p.tasse * b.economia.tasseMese * b.inizio.tesoroMesi, uomini: 0, stabilita: 0, infamia: 0,
    tratti: {}, vivo: true, tregue: {}, obiettivo: null
  };
  game.ordine.push(id);
  initDiplomacy(game);
  initGovernment(game);
  return id;
}

// Un anno in mano ai ribelli: la provincia va al popolo vivo della sua cultura che vi confina, o a un popolo nuovo.
export function independence(game, provId) {
  const p = game.province[provId], vecchio = p.owner;
  const fratelli = game.ordine.filter(id => id !== vecchio && game.nazioni[id].vivo &&
    game.nazioni[id].cultura === p.cultura && p.vicini.some(v => game.province[v].owner === id));
  const nuovo = fratelli[0] ?? spawnNation(game, provId);
  if (!fratelli.length) {
    const fine = game.day + game.balance.guerra.tregua; // l'indipendenza è riconosciuta: niente guerra subito
    game.nazioni[nuovo].tregue[vecchio] = fine;
    game.nazioni[vecchio].tregue[nuovo] = fine;
  }
  p.owner = nuovo;
  p.controller = nuovo;
  p.ribelliDal = null;
  p.assimilazione = 0;
  p.assimilazioneDi = nuovo;
  for (const a of Object.values(game.eserciti)) {
    if (a.prov === provId && a.owner === RIBELLI) { a.owner = nuovo; a.percorso = []; }
  }
  log(game, { tipo: 'indipendenza', prov: provId, da: vecchio, a: nuovo });
  checkSurvival(game);
  sendStrandedHome(game);
}
```

In `monthlyCulture`, dopo l'assimilazione e dentro il ciclo:

```js
    if (p.controller === RIBELLI && p.ribelliDal !== null && game.day - p.ribelliDal >= C(game).anniIndipendenza * 365) {
      independence(game, id);
      continue;
    }
    maybeRevolt(game, id);
```
e il commento di `monthlyCulture` diventa `// Ogni mese, in ordine di id: assimilazione, indipendenze, rivolte.`

- [ ] **Step 7: controller per i popoli nuovi** — `modes.js`:

```js
export function buildControllers(game, ia, ai, escludi = null) {
  return syncControllers({}, game, ia, ai, escludi);
}

// Dà un controller ai popoli che non l'hanno ancora: all'inizio tutti, poi quelli nati da un'indipendenza.
export function syncControllers(out, game, ia, ai, escludi = null) {
  game.ordine.forEach((id, i) => {
    if (id === escludi || out[id]) return;
    const jev = ia === 'jev' || (ia === 'misto' && i % 2 === 0);
    out[id] = jev && ai ? ai.controller : rulesController;
  });
  return out;
}
```
  - `session.js` `runDays`: dopo `advanceDay(...)`, `syncControllers(session.controllers, session.game, session.ia, session.ai, session.giocatore);`.
  - `bench.js`: dopo `advanceDay(game, controllers)`, `syncControllers(controllers, game, ia === 'regole' || !ai ? 'regole' : ia, ai);` (import da `modes.js`). Il riepilogo regge gli id nuovi: `tipo` si calcola alla fine della partita; in `acc` si salvano `nome` e `difficolta` (`info[id]?.difficolta ?? 'nuovo'`), `start[id] ?? 0`; le righe usano `a.nome` e `a.difficolta`.
  - `test/bench.test.js`: il primo test diventa `assert.ok(righe.length >= 38)` (in 5 anni può nascere un popolo).

- [ ] **Step 8: regole contro i ribelli** — in `armyOrders`, prima del ciclo:

```js
  // province proprie tenute o invase dai ribelli: si reprimono anche in pace
  const rivolte = Object.values(game.province).filter(p => p.owner === id &&
    (p.controller === RIBELLI || Object.values(game.eserciti).some(e => e.prov === p.id && e.owner === RIBELLI)));
```
  - ramo in pace: `if (!enemies.length && !rivolte.length) { ...capitale...; continue; }`;
  - "sta assediando": `if (here.controller !== id && (enemies.includes(here.controller) || (here.controller === RIBELLI && here.owner === id))) continue;`
  - `targets` = province nemiche come oggi più `rivolte` (senza duplicati: `[...nemiche, ...rivolte.filter(p => !nemiche.includes(p))]`).

- [ ] **Step 9: verificare** — Run: `node --test test/rebels.test.js`. Expected: 10/10 PASS. Run: `npm test` (log del task). Expected: verde (211).

- [ ] **Step 10: commit** — `git commit -m "feat: rivolte con eserciti ribelli, indipendenze e popoli nuovi"`.

---

### Task 4: Salvataggi

**Files:**
- Modify: `public/js/ui/save.js`, `test/save.test.js`

**Interfaces:**
- Consumes: `RIBELLI`, `ensureRebels`, `initCulture`, `initGovernment`, `SLIDER`, `independence`.

- [ ] **Step 1: test che falliscono** — in `test/save.test.js`:

```js
test('ribelli e popoli nuovi: andata e ritorno identici', () => {
  const s = createSession(data, 'roma', 2);
  runDays(s, 40);
  const g = s.game;
  ensureRebels(g);
  const p = Object.values(g.province).find(x => x.owner !== 'roma' && provincesOf(g, x.owner).length > 1);
  p.cultura = 'nessuna_cultura';
  p.controller = RIBELLI;
  independence(g, p.id);
  const q = Object.values(g.province).find(x => x.owner === 'veio');
  createArmy(g, RIBELLI, q.id, 800, 0);
  g.nazioni.roma.slider.guerra = 2;
  const r = deserialize(serialize(s), data);
  assert.equal(r.ok, true, r.motivo);
  assert.deepEqual(r.session.game, g);
  runDays(s, 60);
  runDays(r.session, 60);
  assert.deepEqual(r.session.game, s.game);
});

test('salvataggio vecchio senza slider, cultura e ribelli: valori iniziali', () => {
  const s = createSession(data, 'roma', 1);
  const old = JSON.parse(serialize(s));
  for (const n of Object.values(old.game.nazioni)) { delete n.slider; delete n.ultimoSlider; }
  for (const p of Object.values(old.game.province)) { delete p.assimilazione; delete p.assimilazioneDi; delete p.colonia; delete p.ribelliDal; }
  const r = deserialize(JSON.stringify(old), data);
  assert.equal(r.ok, true, r.motivo);
  assert.deepEqual(r.session.game.nazioni.roma.slider, { societa: 0, guerra: 0, governo: 0 });
  assert.equal(r.session.game.province.roma.colonia, null);
});

test('campi nuovi non validi: rifiutati', () => {
  const s = createSession(data, 'roma', 1);
  const good = JSON.parse(serialize(s));
  const guasta = f => { const x = structuredClone(good); f(x.game); return JSON.stringify(x); };
  const bad = [
    guasta(g => { g.nazioni.roma.slider = { societa: 9, guerra: 0, governo: 0 }; }),
    guasta(g => { g.nazioni.roma.ultimoSlider = 'ieri'; }),
    guasta(g => { g.province.roma.assimilazione = 400; }),
    guasta(g => { g.province.roma.colonia = 'atlantide'; }),
    guasta(g => { g.province.roma.ribelliDal = -1.5; }),
    guasta(g => { g.nazioni.ribelli = { id: 'ribelli' }; g.province.roma.owner = 'ribelli'; }),
    guasta(g => { g.province.roma.controller = 'ribelli'; }), // ribelli senza record
    guasta(g => { g.nazioni.ribelli = 'boh'; })
  ];
  for (const text of bad) assert.equal(deserialize(text, data).ok, false, text.slice(0, 80));
});

test('il record dei ribelli si ricrea al caricamento', () => {
  const s = createSession(data, 'roma', 1);
  const x = JSON.parse(serialize(s));
  x.game.nazioni.ribelli = { id: 'ribelli', nome: 'Ribelli', colore: '#000000' };
  const r = deserialize(JSON.stringify(x), data);
  assert.equal(r.ok, true, r.motivo);
  assert.deepEqual(r.session.game.nazioni.ribelli.alleati, []);
});
```
(import aggiuntivi: `RIBELLI, createArmy, provincesOf` da `state.js`; `ensureRebels, independence` da `culture.js`.)

- [ ] **Step 2: verificare che falliscano** — Run: `node --test test/save.test.js`. Expected: FAIL (il primo per "elenco dei popoli incoerente").

- [ ] **Step 3: validazione** — in `validateGame`:
  - `const nazioni = Object.keys(g.nazioni).filter(k => k !== RIBELLI);` e il controllo di coerenza usa questa lista; `if (own(g.nazioni, RIBELLI) && !isObj(g.nazioni[RIBELLI])) return 'popolo ribelli';`
  - `const attiva = id => isStr(id) && g.ordine.includes(id);` — si usa al posto di `nazione` per: chiavi di `tregue` e `relazioni`, `alleati`, `protettore`, `tributo.a`, chiavi di `pretesti`/`ambascerie`/`ultimatumInviati`, `p.owner` delle province, `colonia`, `assimilazioneDi`, lati delle guerre, `da`/`a`/`ricevente` delle proposte. `nazione` (record presente, ribelli compresi) resta per `p.controller` e `a.owner`.
  - il ciclo dei popoli salta `RIBELLI` (`if (k === RIBELLI) continue;`) e per gli altri aggiunge:

```js
    if (n.slider !== undefined && !(isObj(n.slider) && SLIDER.every(q => isInt(n.slider[q]) && Math.abs(n.slider[q]) <= 5))) return `popolo ${k}`;
    if (n.ultimoSlider !== undefined && n.ultimoSlider !== null && !isInt(n.ultimoSlider)) return `popolo ${k}`;
```
  - per le province:

```js
    if (p.assimilazione !== undefined && !(isNum(p.assimilazione) && p.assimilazione >= 0 && p.assimilazione <= 100)) return `provincia ${k}`;
    if (p.assimilazioneDi !== undefined && !attiva(p.assimilazioneDi)) return `provincia ${k}`;
    if (p.colonia !== undefined && p.colonia !== null && !attiva(p.colonia)) return `provincia ${k}`;
    if (p.ribelliDal !== undefined && p.ribelliDal !== null && !(isInt(p.ribelliDal) && p.ribelliDal >= 0)) return `provincia ${k}`;
```
- [ ] **Step 4: migrazione** — in `deserialize`, dopo `initDiplomacy(g)`:

```js
  initGovernment(g);
  initCulture(g);
  // il record dei ribelli non viene dal file: si ricrea sempre uguale
  if (g.nazioni[RIBELLI]) { delete g.nazioni[RIBELLI]; ensureRebels(g); }
```
Attenzione: `g = { ...s.game, balance }` condivide `nazioni` con `s.game`, che è un oggetto appena letto dal JSON: modificarlo va bene.

- [ ] **Step 5: verificare** — Run: `node --test test/save.test.js`. Expected: PASS. `npm test` (log). Expected: verde (215).

- [ ] **Step 6: commit** — `git commit -am "feat: salvataggi con slider, cultura, ribelli e popoli nuovi"`.

---

### Task 5: IA — slider, colonie, Jev

**Files:**
- Modify: `public/js/ai/rules.js`, `public/js/ai/questions.js`, `public/js/ai/jev.js`, `public/js/ui/views.js` (`DOMANDE.riforma`), `test/rules.test.js`, `test/questions.test.js`, `test/jev.test.js`

**Interfaces:**
- Consumes: `checkSlider`, `sliderInterval` (Task 1), `malcontent`, `checkColony`, `colonyCost` (Task 2).
- Produces: `isSliderDay(game, id)`, `sliderDecision(game, id) → cmd[]`, `colonyDecision(game, id) → cmd[]` (rules.js); `buildSliderQuestion(game, id, carattere) → {state, questions, meta}|null`, `sampleChoice(answer, meta, chiave, temperatura = 0.8) → {scelta, valore, incerto, probabilita}|null` (questions.js); in `balance.ia`: `"riservaColonia": 10`.

- [ ] **Step 1: test che falliscono**

In `test/rules.test.js` (import `isSliderDay, sliderDecision, colonyDecision`):

```js
test('slider a regole: prima il malcontento, poi la guerra secondo i vicini, poi la società', () => {
  const g = makeGame();
  assert.deepEqual(sliderDecision(g, 'roma'), [{ tipo: 'slider', nazione: 'roma', quale: 'guerra', verso: 1 }]);
  g.province.b.cultura = 'volsca';
  g.nazioni.roma.stabilita = -1;
  assert.deepEqual(sliderDecision(g, 'roma'), [{ tipo: 'slider', nazione: 'roma', quale: 'governo', verso: 1 }]);
  g.nazioni.roma.ultimoSlider = 0;
  assert.deepEqual(sliderDecision(g, 'roma'), []);
});

test('slider a regole: un giorno l\'anno per popolo', () => {
  const g = makeGame();
  const giorni = [];
  for (let d = 0; d < 365; d++) { g.day = d; if (isSliderDay(g, 'roma')) giorni.push(d); }
  assert.equal(giorni.length, 1);
});

test('colonie a regole: nella provincia straniera più ricca, in pace e con riserve', () => {
  const g = makeGame();
  g.province.b.cultura = 'volsca';
  g.province.a.cultura = 'volsca';
  g.nazioni.roma.cultura = 'latina';
  g.nazioni.roma.tesoro = 100;
  g.nazioni.roma.uomini = 3000;
  assert.deepEqual(colonyDecision(g, 'roma'), [{ tipo: 'colonia', nazione: 'roma', provincia: 'a' }]);
  g.nazioni.roma.uomini = 1500;
  assert.deepEqual(colonyDecision(g, 'roma'), []);
});
```

In `test/questions.test.js` (import `buildSliderQuestion, sampleChoice`):

```js
test('domanda sulla riforma: solo le mosse legali, più "nessuna"', () => {
  const g = makeGame();
  g.nazioni.roma.slider.guerra = 5;
  const q = buildSliderQuestion(g, 'roma', 'Ambiziosa.');
  const opzioni = Object.keys(q.questions.riforma.criteria);
  assert.deepEqual(opzioni, ['nessuna', 'patrizi', 'plebe', 'difesa', 'accentramento', 'autonomia']);
  assert.deepEqual(q.meta.riforma.mappa.difesa, { quale: 'guerra', verso: -1 });
  assert.equal(q.meta.riforma.mappa.nessuna, null);
  assert.equal(q.state.riforme.guerra, 5);
  g.nazioni.roma.ultimoSlider = 0;
  assert.equal(buildSliderQuestion(g, 'roma', ''), null);
});

test('estrazione a temperatura: deterministica per chiave, segue le probabilità', () => {
  const meta = { mappa: { a: 1, b: 2, c: 3 } };
  const ans = { probabilities: { a: 0.75, b: 0.25, c: 0, z: 0.5 } };
  assert.deepEqual(sampleChoice(ans, meta, 42), sampleChoice(ans, meta, 42));
  let quanteA = 0;
  for (let k = 0; k < 1000; k++) {
    const v = sampleChoice(ans, meta, k);
    assert.ok(v.scelta === 'a' || v.scelta === 'b'); // c ha probabilità 0, z non è un'opzione
    if (v.scelta === 'a') quanteA++;
  }
  assert.ok(quanteA > 720 && quanteA < 880, String(quanteA)); // 0,75^1,25 / (0,75^1,25 + 0,25^1,25) ≈ 0,80
  assert.equal(sampleChoice({}, meta, 1), null);
});
```

In `test/jev.test.js`:

```js
test('Jev sceglie la riforma: il comando segue la sua risposta, il registro la ricorda', async () => {
  const g = makeGame();
  const records = [];
  const ask = async ({ questions }) => ({
    answers: Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, k === 'riforma'
      ? { type: 'choice', choice: 'patrizi', probabilities: { patrizi: 1 }, confidence: 1 }
      : { type: 'choice', choice: Object.keys(q.criteria)[0], probabilities: { [Object.keys(q.criteria)[0]]: 1 }, confidence: 1 }])),
    usage: { input_tokens: 1, output_tokens: 1 }
  });
  const ai = createJevAi({ ask, caratteri, onRecord: r => records.push(r) });
  const controllers = { roma: ai.controller };
  await play(g, controllers, ai, 400);
  const r = records.find(x => x.domande.some(d => d.domanda === 'riforma'));
  assert.ok(r);
  assert.deepEqual(r.comandi.filter(c => c.tipo === 'slider'), [{ tipo: 'slider', nazione: 'roma', quale: 'societa', verso: -1 }]);
  assert.equal(g.nazioni.roma.slider.societa, -1);
});
```
(`play` è l'helper già presente nel file; se la sua firma è diversa si adatta la chiamata con una riga `Ruling:`.)

- [ ] **Step 2: verificare che falliscano** — Run: `node --test test/rules.test.js test/questions.test.js test/jev.test.js`. Expected: FAIL (funzioni non esportate).

- [ ] **Step 3: rules.js** — import `checkSlider` (government.js), `malcontent, checkColony, colonyCost` (culture.js), `provincesOf` (state.js). Aggiungere:

```js
export function isSliderDay(game, id) {
  return game.day % 365 === hashId(id) % 365;
}

// Riforme a regole: prima calmare le province scontente, poi la dottrina secondo i vicini, poi la società secondo i bisogni.
export function sliderDecision(game, id) {
  const n = game.nazioni[id], soglia = game.balance.cultura.sogliaRivolta;
  const mosse = [];
  if (provincesOf(game, id).some(p => malcontent(game, p.id) > soglia)) mosse.push(['governo', 1]);
  const minaccia = game.ordine.some(o => o !== id && game.nazioni[o].vivo && bordersNation(game, id, o) && power(game, o) > power(game, id));
  mosse.push(['guerra', minaccia ? -1 : 1]);
  mosse.push(['societa', n.uomini < maxManpower(game, id) / 2 ? 1 : -1]);
  const m = mosse.find(([q, v]) => !checkSlider(game, id, q, v));
  return m ? [{ tipo: 'slider', nazione: id, quale: m[0], verso: m[1] }] : [];
}

// Una colonia nella provincia straniera più ricca, in pace e con denaro e uomini che avanzano.
export function colonyDecision(game, id) {
  const n = game.nazioni[id], ia = game.balance.ia, c = game.balance.cultura;
  if (enemiesOfNation(game, id).length || n.uomini < c.coloniaUomini + ia.reclutaSoglia) return [];
  const p = provincesOf(game, id)
    .filter(p => !checkColony(game, id, p.id) && n.tesoro >= colonyCost(game, p.id) + ia.riservaColonia)
    .sort((a, b) => b.tasse - a.tasse || (a.id < b.id ? -1 : 1))[0];
  return p ? [{ tipo: 'colonia', nazione: id, provincia: p.id }] : [];
}
```
Nel test delle colonie: `a` (tasse 4) batte `b` (tasse 2); costo 22, riserva 10: 100 basta; con 1500 uomini < 1000 + 1000 niente colonia.
  - `rulesController`: `if (isSliderDay(game, id)) cmds.push(...sliderDecision(game, id));` e nel giorno di revisione `cmds.push(...strategy(game, id), ...colonyDecision(game, id));`.
  - `balance.json` `ia`: `"riservaColonia": 10`.

- [ ] **Step 4: questions.js** — import `checkSlider, sliderInterval` (government.js), `malcontent` (culture.js), `sliderOf, provincesOf` (state.js). Aggiungere:

```js
const LEVE = [
  ['societa', -1, 'patrizi', 'Dare più potere ai patrizi: +2% di tasse per ogni passo.'],
  ['societa', 1, 'plebe', 'Dare più spazio alla plebe: +3% di reclute per ogni passo.'],
  ['guerra', -1, 'difesa', 'Educare il popolo alla difesa: oltre −4, +1 al dado quando si combatte in casa.'],
  ['guerra', 1, 'attacco', 'Educare il popolo all\'attacco: oltre +4, +1 al dado quando si combatte in terra nemica.'],
  ['governo', -1, 'accentramento', 'Accentrare il potere: le province straniere si assimilano prima, ma il malcontento cresce.'],
  ['governo', 1, 'autonomia', 'Lasciare autonomia alle province: meno malcontento, ma assimilazione più lenta.']
];

export function buildSliderQuestion(game, id, carattere) {
  const criteria = { nessuna: 'Non fare riforme per ora: la situazione va bene così.' };
  const mappa = { nessuna: null };
  for (const [quale, verso, k, testo] of LEVE) {
    if (checkSlider(game, id, quale, verso)) continue;
    criteria[k] = testo;
    mappa[k] = { quale, verso };
  }
  if (Object.keys(mappa).length === 1) return null;
  const n = game.nazioni[id], s = sliderOf(game, id), prov = provincesOf(game, id);
  const state = statoPopolo(game, id, carattere);
  state.riforme = {
    societa: s.societa, guerra: s.guerra, governo: s.governo,
    nota: `Ogni leva va da −5 (patrizi, difesa, accentramento) a +5 (plebe, attacco, autonomia); la prossima riforma tra ${sliderInterval(game, id) / 365} anni.`
  };
  state.province = {
    totali: prov.length,
    di_altra_cultura: prov.filter(p => p.cultura !== n.cultura).length,
    scontente: prov.filter(p => malcontent(game, p.id) > game.balance.cultura.sogliaRivolta).length
  };
  state.in_guerra = enemiesOfNation(game, id).length > 0;
  return {
    state,
    questions: {
      riforma: {
        type: 'choice',
        instructions: 'Sei il consiglio di `popolo.nome` e decidi secondo `popolo.carattere`. Guardando `riforme`, `province` e la situazione, quale riforma fai adesso?',
        criteria
      }
    },
    meta: { riforma: { tipo: 'slider', mappa, prudente: 'nessuna' } }
  };
}

// Numero in [0, 1) da una chiave intera (un passo di mulberry32): non tocca il generatore della partita.
function hashUnit(n) {
  let t = (n + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Scelte di gusto: si estrae dalle probabilità (temperatura 0,8) invece di prendere sempre la più probabile.
export function sampleChoice(answer, meta, chiave, temperatura = 0.8) {
  const probs = answer?.probabilities;
  if (!probs || typeof probs !== 'object') return null;
  const voci = Object.entries(probs)
    .filter(([k, v]) => typeof v === 'number' && v > 0 && Object.hasOwn(meta.mappa, k))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  if (!voci.length) return null;
  const pesi = voci.map(([, v]) => v ** (1 / temperatura));
  let u = hashUnit(chiave) * pesi.reduce((s, x) => s + x, 0);
  let i = 0;
  while (i < voci.length - 1 && (u -= pesi[i]) >= 0) i++;
  const scelta = voci[i][0];
  return { scelta, valore: meta.mappa[scelta], incerto: false, probabilita: probs };
}
```
`enemiesOfNation` va aggiunto all'import da `rules.js` se manca (c'è già).

- [ ] **Step 5: jev.js** — import `isSliderDay, sliderDecision, colonyDecision` (rules.js) e `buildSliderQuestion, sampleChoice` (questions.js).
  - in `applica`, prima del ramo generico (`const v = usabile ? interpretChoice(...)`):

```js
      if (meta.tipo === 'slider') {
        const v = usabile ? sampleChoice(ans, meta, job.seq * 100003 + job.giorno) : null;
        record.comandi.push(...(v ? (v.valore ? [{ tipo: 'slider', nazione: id, ...v.valore }] : []) : sliderDecision(game, id)));
        record.domande.push({ domanda: 'riforma', scelta: v ? v.scelta : 'regola', fonte: v ? 'jev' : 'regola', probabilita: v ? v.probabilita : null });
        continue;
      }
```
  - in `controller`: nel giorno di revisione aggiungere `cmds.push(...colonyDecision(game, id));` dopo le iniziative/paci; poi

```js
    if (isSliderDay(game, id)) {
      const q = buildSliderQuestion(game, id, caratteri[id] ?? '');
      if (q) enqueue({ nazione: id, giorno: game.day, req: { state: q.state, questions: q.questions }, meta: q.meta });
    }
```
  - in `createReplayAi`: nel giorno di revisione anche `cmds.push(...colonyDecision(game, id));` (stesso ordine del controller Jev).
  - `views.js` `DOMANDE`: `riforma: 'Quale riforma?'`.

- [ ] **Step 6: verificare** — Run: `node --test test/rules.test.js test/questions.test.js test/jev.test.js test/bench.test.js`. Expected: PASS (il bench misto rigioca identico: Review Focus 5). `npm test` (log). Expected: verde (221).

- [ ] **Step 7: commit** — `git commit -am "feat: riforme e colonie per le regole, riforma scelta da Jev con estrazione a temperatura"`.

---

### Task 6: Interfaccia e prova di fumo

**Files:**
- Modify: `public/js/ui/views.js`, `public/js/ui/panels.js`, `public/js/ui/colors.js`, `public/index.html`, `public/css/style.css`, `public/js/main.js`, `tools/smoke.mjs`, `test/views.test.js`, `test/panels.test.js`

**Interfaces:**
- Consumes: tutto il resto.
- Produces: `governmentView` con `effettiGoverno` e `slider: [{quale, nome, sinistra, destra, valore, meno, piu}]`; `provinceInfo` con `malcontento`, `assimilazione` (`null` se stessa cultura), `colonia`, `azioni` (`null` se non è tua); modalità mappa `malcontento`; notizie `rivolta`, `indipendenza`, `assimilata`.

- [ ] **Step 1: test che falliscono** — in `test/views.test.js`:

```js
test('governo', () => {
  const g = makeGame();
  const v = V.governmentView(g, 'roma');
  assert.equal(v.governo, 'neutro');
  assert.equal(v.effettiGoverno, '');
  assert.deepEqual(v.slider.map(l => [l.quale, l.valore, l.meno, l.piu]),
    [['societa', '0', null, null], ['guerra', '0', null, null], ['governo', '0', null, null]]);
  g.nazioni.roma.governo = 'tribù';
  assert.equal(V.governmentView(g, 'roma').effettiGoverno, 'tasse -20%, reclute +20%');
  g.nazioni.roma.governo = 'monarchia';
  assert.equal(V.governmentView(g, 'roma').effettiGoverno, 'la stabilità tende a +1');
  g.nazioni.roma.slider.guerra = 5;
  g.nazioni.roma.ultimoSlider = 0;
  const w = V.governmentView(g, 'roma').slider[1];
  assert.equal(w.valore, '+5');
  assert.equal(w.piu, 'già al limite');
  assert.equal(w.meno, 'prossima riforma tra 10 anni');
});

test('provincia: malcontento, assimilazione, colonia, azioni', () => {
  const g = makeGame();
  g.province.b.cultura = 'volsca';
  g.province.b.assimilazione = 42.7;
  const v = V.provinceInfo(g, 'b', 'roma');
  assert.equal(v.malcontento, 3);
  assert.equal(v.assimilazione, 42);
  assert.equal(v.colonia, false);
  assert.equal(v.azioni.colonia.motivo, 'denaro insufficiente');
  assert.equal(v.azioni.fortifica.costo, 15);
  assert.equal(V.provinceInfo(g, 'a', 'roma').assimilazione, null);
  assert.equal(V.provinceInfo(g, 'c', 'roma').azioni, null);
});

test('notizie di rivolte e indipendenze', () => {
  const g = makeGame();
  ensureRebels(g);
  assert.equal(V.formatLogEntry({ tipo: 'rivolta', prov: 'b', nazione: 'roma' }, g, 'roma'), 'Rivolta a B contro roma!');
  assert.equal(V.formatLogEntry({ tipo: 'rivolta', prov: 'c', nazione: 'volsci' }, g, 'roma'), null);
  assert.equal(V.formatLogEntry({ tipo: 'indipendenza', prov: 'c', da: 'volsci', a: 'latini' }, g, 'roma'), 'C si stacca da volsci e passa a latini.');
  assert.equal(V.formatLogEntry({ tipo: 'assimilata', prov: 'b', nazione: 'roma' }, g, 'roma'), 'B ha preso la tua cultura.');
});

test('mappa del malcontento', () => {
  const g = makeGame();
  assert.equal(provinceFill(g, g.province.b, 'malcontento', 'roma'), 'hsl(120, 55%, 50%)');
  g.province.b.cultura = 'volsca';
  assert.equal(provinceFill(g, g.province.b, 'malcontento', 'roma'), 'hsl(84, 55%, 50%)');
});
```
(sostituisce il vecchio test `governo`; import `ensureRebels` da `culture.js`.) In `test/panels.test.js` il test d'escape aggiunge un `governoHtml` con `nome: evil` nelle leve e un `provinceHtml` con `azioni` e `malcontento: evil`, verificando che `<img` non compaia.

- [ ] **Step 2: verificare che falliscano** — Run: `node --test test/views.test.js test/panels.test.js`. Expected: FAIL.

- [ ] **Step 3: views.js**

```js
const LEVE = [
  { quale: 'societa', nome: 'Società', sinistra: 'patrizi', destra: 'plebe' },
  { quale: 'guerra', nome: 'Dottrina', sinistra: 'difesa', destra: 'attacco' },
  { quale: 'governo', nome: 'Province', sinistra: 'accentramento', destra: 'autonomia' }
];
const GOVERNO = {
  tasse: v => `tasse ${v > 0 ? '+' : ''}${pct(v)}%`,
  reclute: v => `reclute ${v > 0 ? '+' : ''}${pct(v)}%`,
  equilibrioStabilita: v => `la stabilità tende a ${segno(v)}`,
  intervalloSlider: v => `riforme ogni ${v} anni`,
  foedusRapporto: v => `foedus con forza ${v} volte`
};
```
  - `governmentView` aggiunge `effettiGoverno: Object.entries(governmentOf(game, g)).map(([k, v]) => GOVERNO[k](v)).join(', ')` e `slider: LEVE.map(l => ({ ...l, valore: segno(sliderOf(game, g)[l.quale]), meno: checkSlider(game, g, l.quale, -1), piu: checkSlider(game, g, l.quale, 1) }))`.
  - `provinceInfo` aggiunge `malcontento: malcontent(game, id)`, `assimilazione: p.cultura !== game.nazioni[p.owner].cultura ? Math.floor(p.assimilazione) : null`, `colonia: hasColony(p)`, `azioni: g && p.owner === g ? { colonia: { costo: colonyCost(game, id), uomini: game.balance.cultura.coloniaUomini, motivo: checkColony(game, g, id) }, fortifica: { costo: fortCost(game, id), motivo: checkFortify(game, g, id) } } : null`.
  - `formatLogEntry`: `case 'rivolta': return e.nazione === g ? \`Rivolta a ${P(e.prov)} contro ${N(e.nazione)}!\` : null;` `case 'indipendenza': return \`${P(e.prov)} si stacca da ${N(e.da)} e passa a ${N(e.a)}.\`;` `case 'assimilata': return e.nazione === g ? \`${P(e.prov)} ha preso la tua cultura.\` : null;`. Il commento sopra la funzione nomina le indipendenze tra le notizie per tutti.

- [ ] **Step 4: colors.js** — in `provinceFill`: `case 'malcontento': return \`hsl(${Math.round(120 - 12 * malcontent(game, prov.id))}, 55%, 50%)\`;`. In `fillSignature`: ogni provincia aggiunge `p.cultura`; con `modo === 'malcontento'` aggiunge `malcontent(game, p.id)` e la stabilità del padrone vi entra già attraverso il valore.

- [ ] **Step 5: panels.js**

```js
export function governoHtml(v) {
  const leva = l => `<div class="leva"><span class="nome">${esc(l.nome)}</span>` +
    `<button class="piccolo" data-azione="slider" data-quale="${esc(l.quale)}" data-verso="-1"${l.meno ? ` disabled title="${esc(l.meno)}"` : ''}>◀ ${esc(l.sinistra)}</button>` +
    `<b>${esc(l.valore)}</b>` +
    `<button class="piccolo" data-azione="slider" data-quale="${esc(l.quale)}" data-verso="1"${l.piu ? ` disabled title="${esc(l.piu)}"` : ''}>${esc(l.destra)} ▶</button></div>`;
  return `<h3>${esc(v.nome)}</h3><table>` +
    `<tr><td>Governo</td><td>${esc(v.governo)}${v.effettiGoverno ? ` <span class="muto">(${esc(v.effettiGoverno)})</span>` : ''}</td></tr>` +
    `<tr><td>Stabilità</td><td>${esc(v.stabilita)}</td></tr>` +
    `<tr><td>Tratti</td><td>${esc(v.tratti || 'nessuno')}</td></tr></table>` +
    `<div class="comandi"><button data-azione="alza-stabilita"${v.puoAlzare ? '' : ' disabled'}>Alza stabilità (${esc(v.costoStabilita)} denari)</button></div>` +
    `<h3>Riforme</h3>${v.slider.map(leva).join('')}`;
}
```
`provinceHtml`: righe in più `['Malcontento', \`${v.malcontento}/10\`]`, se `v.assimilazione !== null` `['Assimilazione', \`${v.assimilazione}%\`]`, se `v.colonia` `['Colonia', 'sì']`; dopo il reclutamento, se `v.azioni`:

```js
  const azioni = v.azioni ? '<h3>Provincia</h3><div class="comandi">' +
    bottone('colonia', v.id, `Fonda colonia (${v.azioni.colonia.costo} denari, ${v.azioni.colonia.uomini} uomini)`, v.azioni.colonia.motivo) +
    bottone('fortifica', v.id, v.azioni.fortifica.costo === null ? 'Fortificazione al massimo' : `Fortifica (${v.azioni.fortifica.costo} denari)`, v.azioni.fortifica.motivo) +
    '</div>' : '';
```
- [ ] **Step 6: index.html, css, main.js**
  - `index.html`: `<button data-modo="malcontento">Malcontento</button>` dopo Relazioni.
  - `style.css`: `.leva { display: flex; align-items: center; gap: 6px; margin: 4px 0; } .leva .nome { width: 70px; } .leva b { width: 24px; text-align: center; }`.
  - `main.js` nello `switch` delle azioni: `case 'slider': comando({ tipo: 'slider', quale: el.dataset.quale, verso: Number(el.dataset.verso) }); break;` `case 'colonia': comando({ tipo: 'colonia', provincia: id }); break;` `case 'fortifica': comando({ tipo: 'fortifica', provincia: id }); break;`.

- [ ] **Step 7: prova di fumo** — in `tools/smoke.mjs`, dopo la sezione diplomazia:

```js
  // --- governo e cultura (tappa 4b)
  await page.click('[data-scheda="governo"]');
  await page.click('[data-azione="slider"][data-quale="guerra"][data-verso="1"]');
  check(await page.evaluate(() => window.universalis.ui.session.game.nazioni.roma.slider.guerra) === 1, 'riforma: dottrina +1');
  check(await page.isDisabled('[data-azione="slider"][data-quale="societa"][data-verso="1"]'), 'riforma successiva spenta');
  check((await page.getAttribute('[data-azione="slider"][data-quale="societa"][data-verso="1"]', 'title')).includes('anni'), 'motivo: anni alla prossima riforma');
  await page.evaluate(() => {
    const g = window.universalis.ui.session.game;
    g.province.roma.cultura = 'etrusca';
    g.nazioni.roma.tesoro = 200; g.nazioni.roma.uomini = 5000;
    window.universalis.ui.selezione.provincia = 'roma';
    window.universalis.avanza(0);
  });
  check((await page.textContent('#provincia')).includes('Malcontento'), 'provincia: malcontento mostrato');
  await page.click('[data-azione="colonia"][data-id="roma"]');
  check(await page.evaluate(() => window.universalis.ui.session.game.province.roma.colonia) === 'roma', 'colonia fondata');
  await page.click('[data-azione="fortifica"][data-id="roma"]');
  check(await page.evaluate(() => window.universalis.ui.session.game.province.roma.fort) >= 1, 'fortificazione salita');
  await page.evaluate(async () => {
    const { ensureRebels } = await import('/js/sim/culture.js');
    const { createArmy } = await import('/js/sim/state.js');
    const g = window.universalis.ui.session.game;
    ensureRebels(g);
    createArmy(g, 'ribelli', 'veio', 800, 0);
    window.universalis.avanza(0);
  });
  await page.click('[data-modo="malcontento"]');
  await wait(300);
  check(await page.evaluate(() => window.universalis.markers().some(m => m.owner === 'ribelli')), 'esercito ribelle disegnato');
  await page.screenshot({ path: 'smoke-malcontento.png' });
```
(`markers()` contiene solo gli eserciti disegnati: se `veio` è fuori schermo si centra la camera su Veio prima del controllo, con una riga `Ruling:`.)

- [ ] **Step 8: verificare** — Run: `node --test test/views.test.js test/panels.test.js`. Expected: PASS. `npm test` (log). Expected: verde (225 circa). Run: `npm run smoke`. Expected: tutte le righe `ok`, nessun `FAIL`.

- [ ] **Step 9: commit** — `git commit -am "feat: scheda Riforme, provincia con malcontento e colonie, mappa del malcontento, notizie di rivolte"`.

---

### Task 7: Bench, Jev reale, README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: bench a regole** — Run: `node bench.js 100 3 regole > .superpowers/sdd/2026-10-13-tappa-4b-governo-cultura/bench-regole.txt`. Expected: termina senza errori; annotare nel registro quanti popoli nuovi nascono e quanti popoli restano vivi (confronto con la tappa 4a). Nessuna taratura qui: la taratura è la tappa 6.

- [ ] **Step 2: Jev reale breve** — se `TYPESAFE_API_KEY` è impostata: `node bench.js 20 1 misto .superpowers/sdd/2026-10-13-tappa-4b-governo-cultura/jev.jsonl`; poi contare le domande `riforma` e la distribuzione delle scelte (`node -e` sul registro). Expected: richieste riuscite, scelte non tutte uguali. Senza chiave: riga `Ruling:` che rimanda la misura.

- [ ] **Step 3: README** — sezione "Governo e cultura": effetti dei governi, le tre leve e il ritmo delle riforme, malcontento, assimilazione, colonie, fortificazioni, rivolte e indipendenze, mappa del malcontento.

- [ ] **Step 4: commit** — `git commit -am "docs: README della tappa 4b"`.
