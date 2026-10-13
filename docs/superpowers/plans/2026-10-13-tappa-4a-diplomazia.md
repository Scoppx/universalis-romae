# Universalis Romae — Tappa 4a: diplomazia — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relazioni, ambascerie, alleanze con chiamata alle armi, guerre a più popoli, foedus, tributi, ultimatum, pretesti e coalizioni; l'IA (regole e Jev) li usa, il giocatore li ha nella scheda Diplomazia.

**Architecture:** Un modulo nuovo `sim/diplomacy.js` tiene relazioni, proposte diplomatiche, effetti mensili e l'ingresso in guerra di alleati, federati e coalizioni. `war.js` lo usa in `declareWar` e per rispondere alle proposte non di pace; le battaglie si combattono per lato della guerra; gli alleati si attraversano le terre. Regole e Jev rispondono a ogni tipo di proposta; l'iniziativa diplomatica resta alle regole. L'interfaccia riusa i controlli della simulazione (`checkProposal`, `checkWar`, `checkEmbassy`) per spiegare perché un bottone è spento.

**Tech Stack:** come prima.

**Spec:** `docs/superpowers/specs/2026-10-12-universalis-romae-design.md`, sezione 11.

**Esecuzione:** inline.

## Global Constraints

- Relazioni simmetriche, da −200 a +200; base 0, +30 se stessa cultura; numeri in `balance.json` → `diplomazia`.
- Stato nuovo per nazione: `relazioni {id: n}`, `alleati [id]`, `protettore id|null`, `tributo {a, fine}|null`, `pretesti {id: giornoFine}`, `ambascerie {id: giorno}`. Tutto JSON puro; i salvataggi precedenti si caricano e ricevono i valori iniziali.
- Proposte: `tipo` in `pace | alleanza | foedus | tributo | ultimatum | chiamata`; il comando per proporre è `{ tipo: 'proponi', nazione, genere, verso, provincia? }`.
- La simulazione resta deterministica: le iterazioni seguono `game.ordine` o ordinamenti con spareggio sull'id.
- Una proposta accettata si ricontrolla al momento dell'accettazione (la situazione può essere cambiata).
- Commit alla fine di ogni task con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Un alleato di entrambi i popoli in guerra, o in tregua con l'attaccante: non entra in guerra contro un amico (test nel task 3).
2. Proposta accettata quando non vale più (ultimatum su una provincia ormai persa, foedus con un popolo diventato forte, chiamata per una guerra finita): rifiutata senza effetti (test nel task 2 e 3).
3. Popolo eliminato con alleanze, foedus o tributi in corso: tutto ripulito, nessun riferimento a un popolo morto (test nel task 3).
4. Salvataggi della tappa 3 senza i campi nuovi: si caricano e giocano (test nel task 4).
5. Il giocatore federato: non può dichiarare guerra né allearsi, e l'interfaccia lo dice (test nel task 2, prova di fumo nel task 6).

## Mappa dei file

```
public/data/balance.json        + diplomazia
public/js/sim/state.js          + power (spostato dalle regole)
public/js/sim/economy.js        + monthlyManpower
public/js/sim/diplomacy.js      nuovo
public/js/sim/war.js            + checkWar, pretesti, guerre a più popoli, risposte diplomatiche, pulizia
public/js/sim/setup.js          + initDiplomacy
public/js/sim/loop.js           + monthlyDiplomacy
public/js/sim/commands.js       + ambasceria, proponi, rompi_alleanza
public/js/sim/armies.js         canEnter con amici
public/js/sim/combat.js         battaglie per lato
public/js/ai/rules.js           risposte per tipo, iniziative, ultimatum
public/js/ai/questions.js       + buildProposalQuestion
public/js/ai/jev.js             proposte di ogni tipo, iniziative
public/js/ui/save.js            validazione e migrazione
public/js/ui/views.js           diplomacyView, pendingProposals, notizie, consiglio
public/js/ui/panels.js          diplomaziaHtml, proposalHtml
public/js/ui/colors.js          relazioni con alleati, federati, coalizione
public/js/main.js               azioni diplomatiche
```

---

### Task 1: Relazioni, ambascerie, pretesti — *inline*

**Files:**
- Create: `public/js/sim/diplomacy.js` (prima parte)
- Modify: `public/data/balance.json`, `public/js/sim/state.js`, `public/js/sim/economy.js`, `public/js/sim/setup.js`, `public/js/sim/loop.js`, `public/js/sim/war.js` (`hasPretext`), `public/js/sim/commands.js`, `public/js/ai/rules.js` (`power` importato)
- Test: `test/diplomacy.test.js`

**Interfaces:**
- Produces:
  - `state.js`: `power(game, id)` (uomini negli eserciti + metà della riserva; `rules.js` la riesporta).
  - `economy.js`: `monthlyManpower(game, id)` (reclute del mese; usata da `monthlyEconomy`).
  - `diplomacy.js`: `baseRelation(game, a, b)`, `initDiplomacy(game)`, `relation(game, a, b)`, `changeRelation(game, a, b, delta)`, `checkEmbassy(game, from, to) → motivo|null`, `embassy(game, from, to) → { ok, motivo? }`, `monthlyDiplomacy(game)` (deriva delle relazioni verso la base, fuori dalle guerre; pulizia di riferimenti a popoli morti).
  - `war.js`: `hasPretext` vero anche con `nazioni[a].pretesti[d] > day`.
  - Comando `{ tipo: 'ambasceria', nazione, verso }`.

- [ ] **Step 1: Aggiungi i numeri a `balance.json`**

Aggiungi la chiave:

```json
  "diplomazia": {
    "relazioneStessaCultura": 30, "derivaMese": 1, "guerraRelazione": -100,
    "ambasceriaCosto": 3, "ambasceriaEffetto": 25, "ambasceriaAttesa": 365,
    "alleanzaEffetto": 25, "rotturaAlleanza": 25, "rifiutoChiamata": -50, "maxAlleati": 3,
    "foedusRapporto": 3, "foedusMinRelazione": 50, "federatoUomini": 0.2,
    "tributoQuota": 0.2, "tributoAnni": 10, "pretestoAnni": 5,
    "alleanzaMinRelazione": 25, "chiamataMinRelazione": 50, "ultimatumRapporto": 3
  },
```

- [ ] **Step 2: Scrivi il test che fallisce `test/diplomacy.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { advanceDay } from '../public/js/sim/loop.js';
import { declareWar, hasPretext } from '../public/js/sim/war.js';
import { relation, changeRelation, checkEmbassy } from '../public/js/sim/diplomacy.js';

test('relazioni iniziali: 30 tra popoli della stessa cultura, 0 altrimenti; simmetriche', () => {
  const g = makeGame();
  assert.equal(relation(g, 'roma', 'latini'), 30);
  assert.equal(relation(g, 'roma', 'volsci'), 0);
  changeRelation(g, 'roma', 'volsci', -250);
  assert.equal(relation(g, 'volsci', 'roma'), -200);
  assert.deepEqual(g.nazioni.roma.alleati, []);
  assert.equal(g.nazioni.roma.protettore, null);
});

test('ambasceria: costa, alza la relazione, una volta l\'anno', () => {
  const g = makeGame();
  g.nazioni.roma.tesoro = 10;
  assert.equal(applyCommand(g, { tipo: 'ambasceria', nazione: 'roma', verso: 'volsci' }).ok, true);
  assert.equal(relation(g, 'roma', 'volsci'), 25);
  assert.equal(g.nazioni.roma.tesoro, 7);
  assert.equal(checkEmbassy(g, 'roma', 'volsci'), 'ambasceria già inviata quest\'anno');
  g.nazioni.roma.tesoro = 1;
  assert.equal(applyCommand(g, { tipo: 'ambasceria', nazione: 'roma', verso: 'latini' }).motivo, 'denaro insufficiente');
});

test('le relazioni tornano verso la base, ma non durante una guerra', () => {
  const g = makeGame();
  changeRelation(g, 'roma', 'siculi', 10);
  for (let i = 0; i < 70; i++) advanceDay(g); // due inizi di mese
  assert.equal(relation(g, 'roma', 'siculi'), 8);
  changeRelation(g, 'roma', 'volsci', 10);
  declareWar(g, 'roma', 'volsci');
  const v = relation(g, 'roma', 'volsci');
  for (let i = 0; i < 70; i++) advanceDay(g);
  assert.equal(relation(g, 'roma', 'volsci'), v);
});

test('pretesto da un rifiuto: vale fino alla scadenza', () => {
  const g = makeGame();
  assert.equal(hasPretext(g, 'roma', 'volsci'), false);
  g.nazioni.roma.pretesti.volsci = g.day + 10;
  assert.equal(hasPretext(g, 'roma', 'volsci'), true);
  g.day += 11;
  assert.equal(hasPretext(g, 'roma', 'volsci'), false);
});
```

Nota sul test "base": fra il giorno 0 e il 70 ci sono due primi del mese (1 maggio, giorno 10; 1 giugno, giorno 41): 10 → 8.

Nota sul test "guerra": la relazione Roma–Volsci è portata a 10 prima della guerra (dal task 3 `declareWar` toglie 100); durante la guerra la deriva non la riporta verso 0.

- [ ] **Step 3: Verifica che fallisca**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../sim/diplomacy.js'`.

- [ ] **Step 4: Implementa**

`state.js`, in fondo:

```js
// Forza in uomini: quelli negli eserciti più metà della riserva.
export function power(game, id) {
  const men = armiesOf(game, id).reduce((s, a) => s + a.fanteria + a.cavalleria, 0);
  return men + game.nazioni[id].uomini * 0.5;
}
```

`rules.js`: togli la funzione `power` e aggiungi `power` all'import da `../sim/state.js`, più `export { power };`.

`economy.js`: aggiungi

```js
export function monthlyManpower(game, id) {
  const n = game.nazioni[id];
  return Math.round(sumOf(paying(game, id), 'uomini') * game.balance.economia.uominiMese * (1 + (n.tratti.reclute || 0)));
}
```

e in `monthlyEconomy` sostituisci il calcolo di `regen` con `const regen = monthlyManpower(game, id);`.

`public/js/sim/diplomacy.js`:

```js
// Diplomazia: relazioni, ambascerie, alleanze, foedus, tributi, ultimatum, pretesti, coalizioni, chiamate alle armi.
import { clamp } from './state.js';
import { atWar } from './war.js';

const D = game => game.balance.diplomazia;

export function baseRelation(game, a, b) {
  return game.nazioni[a].cultura === game.nazioni[b].cultura ? D(game).relazioneStessaCultura : 0;
}

// Valori iniziali dei campi diplomatici; non tocca quelli già presenti (salvataggi vecchi, popoli nuovi).
export function initDiplomacy(game) {
  for (const a of game.ordine) {
    const n = game.nazioni[a];
    n.relazioni ??= {};
    for (const b of game.ordine) if (a !== b && n.relazioni[b] === undefined) n.relazioni[b] = baseRelation(game, a, b);
    n.alleati ??= [];
    n.protettore ??= null;
    n.tributo ??= null;
    n.pretesti ??= {};
    n.ambascerie ??= {};
  }
}

export function relation(game, a, b) {
  return game.nazioni[a].relazioni[b] ?? baseRelation(game, a, b);
}

export function changeRelation(game, a, b, delta) {
  const v = clamp(relation(game, a, b) + delta, -200, 200);
  game.nazioni[a].relazioni[b] = v;
  game.nazioni[b].relazioni[a] = v;
}

export function checkEmbassy(game, from, to) {
  const A = game.nazioni[from];
  if (!A?.vivo || !game.nazioni[to]?.vivo || from === to) return 'popolo non valido';
  if (game.day - (A.ambascerie[to] ?? -Infinity) < D(game).ambasceriaAttesa) return 'ambasceria già inviata quest\'anno';
  if (A.tesoro < D(game).ambasceriaCosto) return 'denaro insufficiente';
  return null;
}

export function embassy(game, from, to) {
  const err = checkEmbassy(game, from, to);
  if (err) return { ok: false, motivo: err };
  const A = game.nazioni[from];
  A.tesoro -= D(game).ambasceriaCosto;
  A.ambascerie[to] = game.day;
  changeRelation(game, from, to, D(game).ambasceriaEffetto);
  return { ok: true };
}

export function monthlyDiplomacy(game) {
  const d = D(game);
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    if (!n.vivo) continue;
    n.alleati = n.alleati.filter(x => game.nazioni[x].vivo);
    for (const o of game.ordine) {
      if (o <= id || !game.nazioni[o].vivo || atWar(game, id, o)) continue; // ogni coppia una volta
      const v = relation(game, id, o), b = baseRelation(game, id, o);
      if (v !== b) changeRelation(game, id, o, Math.sign(b - v) * Math.min(d.derivaMese, Math.abs(b - v)));
    }
  }
}
```

`setup.js`: importa `initDiplomacy` e chiamala prima di `return game;`.

`loop.js`: importa `monthlyDiplomacy` e chiamala subito dopo `monthlyEconomy(game)` (stesso `if`).

`war.js`, `hasPretext`:

```js
export function hasPretext(game, attacker, defender) {
  return game.nazioni[defender].infamia > game.balance.infamia.soglia ||
    (game.nazioni[attacker].pretesti?.[defender] ?? -1) > game.day;
}
```

`commands.js`: importa `embassy` da `./diplomacy.js` e aggiungi

```js
    case 'ambasceria':
      return embassy(game, cmd.nazione, cmd.verso);
```

- [ ] **Step 5: Verifica che passino**

Run: `npm test`
Expected: PASS, 156 test. Se il test di determinismo o del rigioco fallisce, controlla che `monthlyDiplomacy` iteri solo su `game.ordine`.

- [ ] **Step 6: Commit**

```bash
git add public/data/balance.json public/js/sim/state.js public/js/sim/economy.js public/js/sim/diplomacy.js public/js/sim/setup.js public/js/sim/loop.js public/js/sim/war.js public/js/sim/commands.js public/js/ai/rules.js test/diplomacy.test.js
git commit -m "feat: relazioni, ambascerie e pretesti"
```

---

### Task 2: Proposte diplomatiche — *inline*

**Files:**
- Modify: `public/js/sim/diplomacy.js`, `public/js/sim/war.js`, `public/js/sim/commands.js`, `public/js/sim/loop.js` (nessuna modifica se `monthlyDiplomacy` è già chiamata)
- Test: `test/diplomacy.test.js` (aggiunte)

**Interfaces:**
- Produces:
  - `diplomacy.js`: `allied(game, a, b)`, `federatiOf(game, id)`, `friendly(game, a, b)` (alleati, o protettore e federato), `checkProposal(game, from, genere, to, extra) → motivo|null`, `propose(game, from, genere, to, extra) → { ok, motivo?, proposta? }`, `breakAlliance(game, a, b)`, `answerDiplomatic(game, p, accetta)`; `monthlyDiplomacy` paga i tributi e passa gli uomini dei federati.
  - `war.js`: `checkWar(game, attacker, defender) → motivo|null` (usata da `declareWar`; in più: un federato non dichiara guerra, non si attacca un amico); `answerProposal` delega a `answerDiplomatic` per i tipi diversi da `pace`.
  - Comandi `{ tipo: 'proponi', nazione, genere, verso, provincia? }` e `{ tipo: 'rompi_alleanza', nazione, con }`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `test/diplomacy.test.js` aggiorna gli import:

```js
import { relation, changeRelation, checkEmbassy, checkProposal, allied } from '../public/js/sim/diplomacy.js';
import { createArmy } from '../public/js/sim/state.js';
import { monthlyDiplomacy } from '../public/js/sim/diplomacy.js';
```

e aggiungi:

```js
const proponi = (g, da, genere, verso, extra = {}) => applyCommand(g, { tipo: 'proponi', nazione: da, genere, verso, ...extra });
const rispondi = (g, chi, proposta, accetta) => applyCommand(g, { tipo: 'rispondi', nazione: chi, proposta, accetta });

test('alleanza: proposta, accettazione, rottura', () => {
  const g = makeGame();
  const { proposta } = proponi(g, 'roma', 'alleanza', 'latini');
  assert.equal(proponi(g, 'roma', 'alleanza', 'latini').motivo, 'proposta già in attesa');
  assert.deepEqual(rispondi(g, 'latini', proposta, true), { ok: true, accettata: true });
  assert.equal(allied(g, 'roma', 'latini'), true);
  assert.equal(checkProposal(g, 'roma', 'alleanza', 'latini'), 'siete già alleati');
  assert.equal(applyCommand(g, { tipo: 'dichiara_guerra', nazione: 'roma', contro: 'latini' }).motivo, 'siete alleati');
  const prima = relation(g, 'roma', 'latini');
  assert.equal(applyCommand(g, { tipo: 'rompi_alleanza', nazione: 'roma', con: 'latini' }).ok, true);
  assert.equal(allied(g, 'latini', 'roma'), false);
  assert.equal(relation(g, 'roma', 'latini'), prima - 25);
});

test('foedus: solo a un vicino molto più debole e amico; il federato non dichiara guerre', () => {
  const g = makeGame();
  assert.equal(checkProposal(g, 'roma', 'foedus', 'volsci'), 'non abbastanza più forte');
  createArmy(g, 'roma', 'a', 20000, 0);
  assert.equal(checkProposal(g, 'roma', 'foedus', 'volsci'), 'relazioni troppo basse');
  changeRelation(g, 'roma', 'volsci', 60);
  const { proposta } = proponi(g, 'roma', 'foedus', 'volsci');
  rispondi(g, 'volsci', proposta, true);
  assert.equal(g.nazioni.volsci.protettore, 'roma');
  assert.equal(applyCommand(g, { tipo: 'dichiara_guerra', nazione: 'volsci', contro: 'siculi' }).motivo, 'un federato non dichiara guerre');
  assert.equal(checkProposal(g, 'volsci', 'alleanza', 'siculi'), 'un federato non stringe alleanze');
  g.nazioni.volsci.uomini = 1000;
  while (g.day !== 10) advanceDay(g); // 1 maggio: reclute del mese (75), il 20% (15) va a Roma
  assert.equal(g.nazioni.volsci.uomini, 1000 + 75 - 15);
});

test('tributo: rifiutato dà un pretesto, accettato si paga ogni mese', () => {
  const g = makeGame();
  const p1 = proponi(g, 'roma', 'tributo', 'volsci').proposta;
  rispondi(g, 'volsci', p1, false);
  assert.equal(g.nazioni.roma.pretesti.volsci, g.day + 5 * 365);
  const p2 = proponi(g, 'roma', 'tributo', 'latini').proposta;
  rispondi(g, 'latini', p2, true);
  assert.deepEqual(g.nazioni.latini.tributo, { a: 'roma', fine: g.day + 10 * 365 });
  const tr = g.nazioni.roma.tesoro, tl = g.nazioni.latini.tesoro;
  monthlyDiplomacy(g); // il 20% delle entrate latine (5 × 0,1 = 0,5) passa a Roma
  assert.ok(Math.abs(g.nazioni.roma.tesoro - tr - 0.1) < 1e-9);
  assert.ok(Math.abs(tl - g.nazioni.latini.tesoro - 0.1) < 1e-9);
});

test('ultimatum: provincia ceduta con infamia; non vale più se la provincia cambia padrone', () => {
  const g = makeGame();
  assert.equal(checkProposal(g, 'roma', 'ultimatum', 'latini', { provincia: 'a' }), 'provincia non valida');
  const p = proponi(g, 'roma', 'ultimatum', 'latini', { provincia: 'e' }).proposta;
  rispondi(g, 'latini', p, true);
  assert.equal(g.province.e.owner, 'roma');
  assert.ok(g.nazioni.roma.infamia >= 2);
  assert.equal(checkProposal(g, 'roma', 'ultimatum', 'latini', { provincia: 'd' }), 'è la sua ultima provincia');
  const q = proponi(g, 'roma', 'ultimatum', 'volsci', { provincia: 'c' }).proposta;
  g.province.c.owner = 'latini';
  assert.equal(rispondi(g, 'volsci', q, true).ok, false);
  assert.equal(g.province.c.owner, 'latini');
});
```

Nota sul test "foedus": con 20000 fanti in più Roma vale almeno tre volte i Volsci; dopo il foedus, al primo del mese (giorno 10) i Volsci reclutano 3 × 25 = 75 uomini e ne mandano il 20% (15) a Roma.

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL (`checkProposal` non esportata).

- [ ] **Step 3: Implementa in `diplomacy.js`**

Cambia gli import in testa:

```js
import { clamp, newId, log, bordersNation, provincesOf, power, maxManpower } from './state.js';
import { atWar, sideOf, enemiesOf, inTruce, checkSurvival } from './war.js';
import { monthlyIncome, monthlyManpower } from './economy.js';
```

Aggiungi:

```js
export function allied(game, a, b) {
  return game.nazioni[a].alleati.includes(b);
}

export function federatiOf(game, id) {
  return game.ordine.filter(x => game.nazioni[x].vivo && game.nazioni[x].protettore === id);
}

// Amici: alleati, o protettore e federato. Si attraversano le terre e non si combattono.
export function friendly(game, a, b) {
  const A = game.nazioni[a], B = game.nazioni[b];
  return allied(game, a, b) || A.protettore === b || B.protettore === a;
}

export function checkProposal(game, from, genere, to, extra = {}) {
  const A = game.nazioni[from], B = game.nazioni[to], d = D(game);
  if (!A?.vivo || !B?.vivo || from === to) return 'popolo non valido';
  if (Object.values(game.proposte).some(p => p.tipo === genere && p.da === from && p.a === to)) return 'proposta già in attesa';
  if (atWar(game, from, to)) return 'siete in guerra';
  switch (genere) {
    case 'alleanza':
      if (allied(game, from, to)) return 'siete già alleati';
      if (A.protettore || B.protettore) return 'un federato non stringe alleanze';
      if (A.alleati.length >= d.maxAlleati || B.alleati.length >= d.maxAlleati) return 'troppe alleanze';
      return null;
    case 'foedus':
      if (A.protettore || B.protettore) return 'già in un foedus';
      if (!bordersNation(game, from, to)) return 'nessun confine';
      if (power(game, from) < d.foedusRapporto * power(game, to)) return 'non abbastanza più forte';
      if (relation(game, from, to) < d.foedusMinRelazione) return 'relazioni troppo basse';
      return null;
    case 'tributo':
      if (!bordersNation(game, from, to)) return 'nessun confine';
      if (B.tributo) return 'paga già un tributo';
      return null;
    case 'ultimatum': {
      const p = game.province[extra.provincia];
      if (!p || p.owner !== to || p.controller !== to) return 'provincia non valida';
      if (!p.vicini.some(v => game.province[v].owner === from)) return 'provincia non confinante';
      if (provincesOf(game, to).length < 2) return 'è la sua ultima provincia';
      return null;
    }
    default:
      return 'proposta sconosciuta';
  }
}

export function propose(game, from, genere, to, extra = {}) {
  const err = checkProposal(game, from, genere, to, extra);
  if (err) return { ok: false, motivo: err };
  const id = newId(game, 'p');
  game.proposte[id] = { id, tipo: genere, da: from, a: to, giorno: game.day, ...(genere === 'ultimatum' ? { provincia: extra.provincia } : {}) };
  log(game, { tipo: 'proposta', proposta: id, da: from, a: to, genere });
  return { ok: true, proposta: id };
}

export function breakAlliance(game, a, b) {
  if (!game.nazioni[a]?.alleati.includes(b)) return { ok: false, motivo: 'non siete alleati' };
  game.nazioni[a].alleati = game.nazioni[a].alleati.filter(x => x !== b);
  game.nazioni[b].alleati = game.nazioni[b].alleati.filter(x => x !== a);
  changeRelation(game, a, b, -D(game).rotturaAlleanza);
  return { ok: true };
}

// Risposta a una proposta che non è di pace (la proposta è già stata tolta da game.proposte).
export function answerDiplomatic(game, p, accetta) {
  const d = D(game), A = game.nazioni[p.da], B = game.nazioni[p.a];
  if (!accetta) {
    if ((p.tipo === 'tributo' || p.tipo === 'ultimatum') && A.vivo) A.pretesti[p.a] = game.day + d.pretestoAnni * 365;
    if (p.tipo === 'chiamata') {
      if (allied(game, p.da, p.a)) breakAlliance(game, p.da, p.a);
      changeRelation(game, p.da, p.a, d.rifiutoChiamata);
    }
    log(game, { tipo: 'rifiutata', proposta: p.id, da: p.da, a: p.a, genere: p.tipo });
    return { ok: true, accettata: false };
  }
  if (p.tipo === 'chiamata') return joinCall(game, p);
  const err = checkProposal(game, p.da, p.tipo, p.a, p);
  if (err) return { ok: false, motivo: err };
  if (p.tipo === 'alleanza') {
    A.alleati.push(p.a);
    B.alleati.push(p.da);
    changeRelation(game, p.da, p.a, d.alleanzaEffetto);
  } else if (p.tipo === 'foedus') {
    for (const x of [...B.alleati]) breakAlliance(game, p.a, x);
    B.protettore = p.da;
  } else if (p.tipo === 'tributo') {
    B.tributo = { a: p.da, fine: game.day + d.tributoAnni * 365 };
  } else if (p.tipo === 'ultimatum') {
    const prov = game.province[p.provincia], inf = game.balance.infamia;
    A.infamia += inf.perProvincia + (prov.cultura !== A.cultura ? inf.culturaDiversa : 0);
    prov.owner = p.da;
    prov.controller = p.da;
    checkSurvival(game);
  }
  log(game, { tipo: 'accordo', genere: p.tipo, da: p.da, a: p.a, provincia: p.provincia ?? null });
  return { ok: true, accettata: true };
}

// Placeholder sostituito nel task 3 con l'ingresso in guerra dell'alleato.
function joinCall() {
  return { ok: false, motivo: 'chiamata non valida' };
}
```

In `monthlyDiplomacy`, dentro il ciclo sulla nazione e prima del filtro degli alleati, aggiungi:

```js
    if (n.tributo) {
      const R = game.nazioni[n.tributo.a];
      if (!R?.vivo || game.day >= n.tributo.fine) n.tributo = null;
      else {
        const q = Math.max(0, monthlyIncome(game, id)) * d.tributoQuota;
        n.tesoro -= q;
        R.tesoro += q;
      }
    }
    if (n.protettore) {
      const P = game.nazioni[n.protettore];
      if (!P?.vivo) n.protettore = null;
      else {
        const t = Math.min(n.uomini, Math.round(monthlyManpower(game, id) * d.federatoUomini));
        n.uomini -= t;
        P.uomini = Math.min(maxManpower(game, n.protettore), P.uomini + t);
      }
    }
```

Nota: la "funzione segnaposto" `joinCall` è voluta solo fra il task 2 e il task 3; il task 3 la sostituisce e i test della chiamata arrivano lì.

- [ ] **Step 4: Implementa in `war.js` e `commands.js`**

In `war.js` importa da `./diplomacy.js`: `friendly, answerDiplomatic`. Aggiungi e usa `checkWar`:

```js
export function checkWar(game, attacker, defender) {
  const A = game.nazioni[attacker], D = game.nazioni[defender];
  if (!A?.vivo || !D?.vivo || attacker === defender) return 'nazione non valida';
  if (A.protettore) return 'un federato non dichiara guerre';
  if (friendly(game, attacker, defender)) return 'siete alleati';
  if (atWar(game, attacker, defender)) return 'già in guerra';
  if (inTruce(game, attacker, defender)) return 'tregua in corso';
  if (!bordersNation(game, attacker, defender)) return 'nessun confine';
  return null;
}
```

In `declareWar` sostituisci i quattro controlli iniziali con:

```js
  const err = checkWar(game, attacker, defender);
  if (err) return { ok: false, motivo: err };
  const A = game.nazioni[attacker];
```

In `answerProposal`, dopo `delete game.proposte[propId];`:

```js
  if (p.tipo !== 'pace') return answerDiplomatic(game, p, accetta);
```

In `commands.js` importa `propose, breakAlliance` e aggiungi:

```js
    case 'proponi':
      return propose(game, cmd.nazione, cmd.genere, cmd.verso, { provincia: cmd.provincia });
    case 'rompi_alleanza':
      return breakAlliance(game, cmd.nazione, cmd.con);
```

- [ ] **Step 5: Verifica che passino**

Run: `npm test`
Expected: PASS, 160 test.

- [ ] **Step 6: Commit**

```bash
git add public/js/sim/diplomacy.js public/js/sim/war.js public/js/sim/commands.js test/diplomacy.test.js
git commit -m "feat: alleanze, foedus, tributi e ultimatum"
```

---

### Task 3: Guerre a più popoli — *inline*

**Files:**
- Modify: `public/js/sim/diplomacy.js` (`onWarDeclared`, `coalition`, `joinCall`), `public/js/sim/war.js` (`declareWar`, `eliminate`), `public/js/sim/armies.js` (`canEnter`), `public/js/sim/combat.js` (lati)
- Test: `test/diplomacy.test.js` (aggiunte)

**Interfaces:**
- Produces:
  - `diplomacy.js`: `coalition(game, x) → [id]` (vicini con relazione negativa quando `x` supera la soglia d'infamia, esclusi gli amici di `x`); `onWarDeclared(game, war)` (ingressi automatici, chiamate, relazioni −100); `cleanupDead(game, id)`.
  - `canEnter` vale anche per le terre degli amici.
  - Battaglie: tutti gli eserciti dello stesso lato della guerra combattono insieme; il bonus di terreno va al lato che controlla la provincia.

- [ ] **Step 1: Scrivi i test che falliscono**

In `test/diplomacy.test.js` aggiungi agli import da `diplomacy.js` `coalition` e in fondo:

```js
const allea = (g, a, b) => rispondi(g, b, proponi(g, a, 'alleanza', b).proposta, true);

test('difesa: gli alleati del difensore entrano da soli, quelli amici dell\'attaccante no', () => {
  const g = makeGame();
  allea(g, 'volsci', 'siculi');
  allea(g, 'volsci', 'latini');
  allea(g, 'roma', 'latini'); // latini alleati di entrambi: restano fuori
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.deepEqual(g.guerre[guerra].difensori, ['volsci', 'siculi']);
  assert.ok(relation(g, 'roma', 'siculi') <= -100);
});

test('attacco: gli alleati dell\'attaccante sono chiamati; chi rifiuta rompe l\'alleanza', () => {
  const g = makeGame();
  allea(g, 'roma', 'siculi');
  allea(g, 'roma', 'latini');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  const chiamate = Object.values(g.proposte).filter(p => p.tipo === 'chiamata' && p.guerra === guerra);
  assert.deepEqual(chiamate.map(p => p.a).sort(), ['latini', 'siculi']);
  rispondi(g, 'siculi', chiamate.find(p => p.a === 'siculi').id, true);
  assert.deepEqual(g.guerre[guerra].attaccanti, ['roma', 'siculi']);
  rispondi(g, 'latini', chiamate.find(p => p.a === 'latini').id, false);
  assert.equal(allied(g, 'roma', 'latini'), false);
});

test('chiamata per una guerra già finita: non vale', () => {
  const g = makeGame();
  allea(g, 'roma', 'siculi');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  const ch = Object.values(g.proposte).find(p => p.tipo === 'chiamata');
  delete g.guerre[guerra];
  assert.equal(rispondi(g, 'siculi', ch.id, true).ok, false);
});

test('coalizione: chi ha troppa infamia trova i vicini ostili uniti', () => {
  const g = makeGame();
  g.nazioni.roma.infamia = 25;
  changeRelation(g, 'roma', 'latini', -80);
  changeRelation(g, 'roma', 'volsci', -10);
  assert.deepEqual(coalition(g, 'roma'), ['latini', 'volsci']);
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.deepEqual(g.guerre[guerra].difensori, ['volsci', 'latini']);
});

test('alleati: passano nelle terre amiche e combattono dalla stessa parte', async () => {
  const { findPath } = await import('../public/js/sim/armies.js');
  const { resolveBattles } = await import('../public/js/sim/combat.js');
  const g = makeGame();
  allea(g, 'roma', 'latini');
  assert.equal(findPath(g, 'roma', 'a', 'e').at(-1), 'e');
  assert.deepEqual(findPath(g, 'roma', 'a', 'd'), ['d']);
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  const { guerra } = declareWar(g, 'volsci', 'roma');
  assert.deepEqual(g.guerre[guerra].difensori, ['roma', 'latini']);
  const r = createArmy(g, 'roma', 'b', 1000, 0), l = createArmy(g, 'latini', 'b', 1000, 0), v = createArmy(g, 'volsci', 'b', 1000, 0);
  resolveBattles(g);
  assert.deepEqual([r.inBattaglia, l.inBattaglia, v.inBattaglia], [true, true, true]);
});

test('popolo eliminato: alleanze, foedus e tributi ripuliti', async () => {
  const { makePeace } = await import('../public/js/sim/war.js');
  const g = makeGame();
  allea(g, 'volsci', 'siculi');
  g.nazioni.latini.tributo = { a: 'volsci', fine: 9999 };
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.guerre[guerra].difensori = ['volsci']; // i siculi restano fuori per questo test
  g.province.c.controller = 'roma';
  g.province.f.controller = 'roma';
  makePeace(g, guerra, 'roma', { province: ['c', 'f'] });
  assert.equal(g.nazioni.volsci.vivo, false);
  assert.deepEqual(g.nazioni.siculi.alleati, []);
  assert.equal(g.nazioni.latini.tributo, null);
});
```

Nota sul test "alleati": nella mappa di prova i Latini hanno `d` ed `e`; con l'alleanza Roma può entrare in `e` (via `b`) e in `d`.

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL (`coalition` non esportata).

- [ ] **Step 3: Implementa**

`diplomacy.js`, sostituisci il segnaposto `joinCall` con:

```js
function joinCall(game, p) {
  const war = game.guerre[p.guerra], d = D(game);
  if (!war || !game.nazioni[p.a].vivo || sideOf(war, p.a)) return { ok: false, motivo: 'la guerra non c\'è più' };
  const side = sideOf(war, p.da);
  if (!side) return { ok: false, motivo: 'la guerra non c\'è più' };
  war[side].push(p.a);
  for (const e of enemiesOf(war, side)) changeRelation(game, p.a, e, d.guerraRelazione);
  log(game, { tipo: 'chiamata', guerra: war.id, nazione: p.a, alleato: p.da });
  return { ok: true, accettata: true };
}

export function coalition(game, x) {
  if (game.nazioni[x].infamia <= game.balance.infamia.soglia) return [];
  return game.ordine.filter(o => o !== x && game.nazioni[o].vivo && bordersNation(game, o, x) &&
    relation(game, o, x) < 0 && !friendly(game, o, x));
}

// Chi entra da solo quando scoppia una guerra, chi viene chiamato.
export function onWarDeclared(game, war) {
  const [att] = war.attaccanti, [dif] = war.difensori;
  const d = D(game);
  const puo = (id, contro) => id && game.nazioni[id]?.vivo && !sideOf(war, id) &&
    !friendly(game, id, contro) && !inTruce(game, id, contro);
  const difesa = [...game.nazioni[dif].alleati, ...federatiOf(game, dif), game.nazioni[dif].protettore, ...coalition(game, att)];
  for (const id of difesa) if (puo(id, att)) war.difensori.push(id);
  for (const id of federatiOf(game, att)) if (puo(id, dif)) war.attaccanti.push(id);
  for (const id of game.nazioni[att].alleati) {
    if (!puo(id, dif)) continue;
    const pid = newId(game, 'p');
    game.proposte[pid] = { id: pid, tipo: 'chiamata', guerra: war.id, da: att, a: id, giorno: game.day };
  }
  for (const a of war.attaccanti) for (const b of war.difensori) changeRelation(game, a, b, d.guerraRelazione);
}

export function cleanupDead(game, id) {
  for (const o of game.ordine) {
    const n = game.nazioni[o];
    n.alleati = n.alleati.filter(x => x !== id);
    if (n.protettore === id) n.protettore = null;
    if (n.tributo?.a === id) n.tributo = null;
  }
  game.nazioni[id].alleati = [];
  game.nazioni[id].protettore = null;
  game.nazioni[id].tributo = null;
}
```

`war.js`:
- importa anche `onWarDeclared, cleanupDead` da `./diplomacy.js`;
- in `declareWar`, subito dopo aver creato `game.guerre[id]`, chiama `onWarDeclared(game, game.guerre[id]);`;
- in `eliminate`, subito dopo `game.nazioni[id].vivo = false;`, chiama `cleanupDead(game, id);`.

`armies.js`, `canEnter`:

```js
export function canEnter(game, nationId, provId) {
  const p = game.province[provId];
  return p.owner === nationId || p.controller === nationId || atWar(game, nationId, p.owner) || friendly(game, nationId, p.owner);
}
```

(con `import { friendly } from './diplomacy.js';`).

`combat.js`:
- in `resolveBattles`, sostituisci la chiamata a `battleDay` con:

```js
    // tutti gli eserciti dello stesso lato della guerra combattono insieme
    const war = warBetween(game, first.owner, enemy.owner);
    const lato = sideOf(war, first.owner), altro = sideOf(war, enemy.owner);
    battleDay(game, provId,
      armies.filter(x => sideOf(war, x.owner) === lato),
      armies.filter(x => sideOf(war, x.owner) === altro));
```

- in `modifier`, la riga del terreno diventa `if (side.some(a => a.owner === prov.controller)) m += c.terreno[prov.terreno];`.

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 166 test. I test della tappa 1 sulle battaglie a tre (`con tre nazioni nella provincia combattono le due in guerra`) devono restare verdi.

- [ ] **Step 5: Commit**

```bash
git add public/js/sim/diplomacy.js public/js/sim/war.js public/js/sim/armies.js public/js/sim/combat.js test/diplomacy.test.js
git commit -m "feat: guerre a più popoli: alleati, federati, coalizioni e chiamate alle armi"
```

---

### Task 4: Salvataggi con la diplomazia — *inline*

**Files:**
- Modify: `public/js/ui/save.js`
- Test: `test/save.test.js` (aggiunte)

**Interfaces:**
- Produces: `validateGame` controlla i campi diplomatici se presenti e i nuovi tipi di proposta; `deserialize` chiama `initDiplomacy` (i salvataggi vecchi ricevono i valori iniziali).

- [ ] **Step 1: Test che falliscono**

In `test/save.test.js`, nei `casi` di `salvataggi manipolati` aggiungi:

```js
    'alleato sconosciuto': g => { g.game.nazioni.veio.alleati = ['atlantide']; },
    'relazione non numerica': g => { g.game.nazioni.veio.relazioni.roma = 'cattiva'; },
    'protettore sconosciuto': g => { g.game.nazioni.veio.protettore = 'atlantide'; },
    'tributo malformato': g => { g.game.nazioni.veio.tributo = { a: 'roma' }; },
    'proposta di tipo sconosciuto': g => {
      g.game.proposte = { p9: { id: 'p9', tipo: 'matrimonio', da: 'veio', a: 'roma', giorno: 0 } };
    },
```

e in fondo:

```js
test('salvataggi senza diplomazia (tappa 3): ricevono i valori iniziali', () => {
  const s = createSession(data, 'roma', 1);
  const g = JSON.parse(serialize(s));
  for (const n of Object.values(g.game.nazioni)) { delete n.relazioni; delete n.alleati; delete n.protettore; delete n.tributo; delete n.pretesti; delete n.ambascerie; }
  const r = deserialize(JSON.stringify(g), data);
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.session.game.nazioni.roma.relazioni.lega_latina, 30);
  assert.deepEqual(r.session.game.nazioni.roma.alleati, []);
  runDays(r.session, 60);
});

test('proposte diplomatiche valide: accettate', () => {
  const s = createSession(data, 'roma', 1);
  s.game.proposte = { p9: { id: 'p9', tipo: 'alleanza', da: 'veio', a: 'roma', giorno: 0 } };
  assert.equal(deserialize(serialize(s), data).ok, true);
});
```

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implementa**

In `public/js/ui/save.js`:
- importa `initDiplomacy` da `../sim/diplomacy.js`;
- nel ciclo sulle nazioni di `validateGame`, dopo il controllo di `obiettivo`:

```js
    if (n.relazioni !== undefined && (!isObj(n.relazioni) || !Object.entries(n.relazioni).every(([o, v]) => nazione(o) && isNum(v)))) return `popolo ${k}`;
    if (n.alleati !== undefined && (!Array.isArray(n.alleati) || !n.alleati.every(nazione))) return `popolo ${k}`;
    if (n.protettore !== undefined && n.protettore !== null && !nazione(n.protettore)) return `popolo ${k}`;
    if (n.tributo !== undefined && n.tributo !== null && !(isObj(n.tributo) && nazione(n.tributo.a) && isInt(n.tributo.fine))) return `popolo ${k}`;
    for (const campo of ['pretesti', 'ambascerie']) {
      if (n[campo] !== undefined && (!isObj(n[campo]) || !Object.entries(n[campo]).every(([o, v]) => nazione(o) && isInt(v)))) return `popolo ${k}`;
    }
```

- sostituisci il ciclo sulle proposte con:

```js
  const TIPI = ['pace', 'alleanza', 'foedus', 'tributo', 'ultimatum', 'chiamata'];
  for (const [k, p] of Object.entries(g.proposte)) {
    if (!ID.test(k) || !isObj(p) || p.id !== k || !TIPI.includes(p.tipo) || !isInt(p.giorno)) return `proposta ${k}`;
    if (!nazione(p.da) || !nazione(p.a)) return `proposta ${k}`;
    if (p.tipo === 'pace' || p.tipo === 'chiamata') { if (!own(g.guerre, p.guerra)) return `proposta ${k}`; }
    if (p.tipo === 'pace') {
      if (!isObj(p.termini) || !nazione(p.termini.ricevente)) return `proposta ${k}`;
      if (!Array.isArray(p.termini.province) || !p.termini.province.every(provincia)) return `proposta ${k}`;
    }
    if (p.tipo === 'ultimatum' && !provincia(p.provincia)) return `proposta ${k}`;
  }
```

- in `deserialize`, prima di creare la sessione: `const game = { ...g, balance: data.balance }; initDiplomacy(game);` e passa `game` a `createSessionFrom`.

Run: `npm test`
Expected: PASS, 168 test.

- [ ] **Step 3: Commit**

```bash
git add public/js/ui/save.js test/save.test.js
git commit -m "feat: salvataggi con la diplomazia e migrazione dei vecchi"
```

---

### Task 5: L'IA usa la diplomazia (regole e Jev) — *inline*

**Files:**
- Modify: `public/js/ai/rules.js`, `public/js/ai/questions.js`, `public/js/ai/jev.js`, `public/js/ui/views.js` (`DOMANDE` del consiglio)
- Test: `test/rules.test.js`, `test/questions.test.js`, `test/jev.test.js` (aggiunte)

**Interfaces:**
- Produces:
  - `rules.js`: `answerProposals` risponde a ogni tipo; `diplomacyInitiatives(game, id) → cmd[]` (al massimo uno: foedus, alleanza contro una minaccia, ambasceria); `ultimatumDecision(game, id) → cmd[]`; `strategy` in pace = ultimatum, altrimenti guerra, altrimenti iniziativa; `legalWarTargets` esclude gli amici e restituisce `[]` per un federato.
  - `questions.js`: `buildProposalQuestion(game, propId, carattere)` (pace come prima; gli altri tipi: choice `accetta`/`rifiuta` con descrizioni per tipo; `meta = { tipo: 'proposta', genere, proposta, mappa: { accetta: true, rifiuta: false }, prudente: 'rifiuta' }`).
  - `jev.js`: usa `buildProposalQuestion`; il record riporta `domanda: genere`; nei giorni di revisione in pace aggiunge `diplomacyInitiatives`.

- [ ] **Step 1: Test che falliscono**

In `test/rules.test.js` aggiungi agli import da `rules.js` `diplomacyInitiatives, ultimatumDecision` e in fondo:

```js
test('regole: rispondono a ogni tipo di proposta', async () => {
  const { propose } = await import('../public/js/sim/diplomacy.js');
  const { createArmy } = await import('../public/js/sim/state.js');
  const g = makeGame();
  const risposte = id => Object.fromEntries(answerProposals(g, id).map(c => [g.proposte[c.proposta].tipo, c.accetta]));
  propose(g, 'roma', 'alleanza', 'latini');       // relazione 30 ≥ 25: sì
  propose(g, 'siculi', 'alleanza', 'volsci');     // relazione 0: no
  assert.deepEqual(risposte('latini'), { alleanza: true });
  assert.deepEqual(risposte('volsci'), { alleanza: false });
  createArmy(g, 'roma', 'a', 20000, 0);
  propose(g, 'roma', 'tributo', 'volsci');        // roma molto più forte: paga
  propose(g, 'roma', 'ultimatum', 'volsci', { provincia: 'c' });
  assert.deepEqual(risposte('volsci'), { alleanza: false, tributo: true, ultimatum: true });
});

test('regole: ultimatum invece della guerra contro un vicino molto più debole, poi guerra col pretesto', async () => {
  const { createArmy } = await import('../public/js/sim/state.js');
  const g = makeGame();
  createArmy(g, 'roma', 'a', 20000, 0);
  const [cmd] = ultimatumDecision(g, 'roma');
  assert.equal(cmd.tipo, 'proponi');
  assert.equal(cmd.genere, 'ultimatum');
  assert.ok(['c', 'd', 'e', 'f'].includes(cmd.provincia));
  g.nazioni.roma.pretesti[cmd.verso] = g.day + 100;
  assert.deepEqual(ultimatumDecision(g, 'roma'), []);
  assert.equal(strategy(g, 'roma')[0].tipo, 'dichiara_guerra');
});

test('regole: iniziative diplomatiche, una per volta', async () => {
  const { createArmy } = await import('../public/js/sim/state.js');
  const { changeRelation } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame();
  createArmy(g, 'volsci', 'c', 20000, 0); // i volsci diventano una minaccia per roma
  assert.deepEqual(diplomacyInitiatives(g, 'roma'), [{ tipo: 'proponi', nazione: 'roma', genere: 'alleanza', verso: 'latini' }]);
  const h = makeGame();
  createArmy(h, 'roma', 'a', 20000, 0);
  changeRelation(h, 'roma', 'volsci', 60);
  assert.deepEqual(diplomacyInitiatives(h, 'roma'), [{ tipo: 'proponi', nazione: 'roma', genere: 'foedus', verso: 'volsci' }]);
});

test('un federato non sceglie guerre', () => {
  const g = makeGame();
  g.nazioni.volsci.protettore = 'roma';
  assert.deepEqual(legalWarTargets(g, 'volsci'), []);
});
```

In `test/questions.test.js` aggiungi `buildProposalQuestion` all'import e:

```js
test('proposte non di pace: scelta accetta/rifiuta con i fatti nello stato', async () => {
  const { propose } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame();
  const { proposta } = propose(g, 'roma', 'alleanza', 'latini');
  const q = buildProposalQuestion(g, proposta, 'Prudenti.');
  assert.equal(q.questions.alleanza.type, 'choice');
  assert.deepEqual(Object.keys(q.questions.alleanza.criteria), ['accetta', 'rifiuta']);
  assert.equal(q.state.proposta.da, 'roma');
  assert.equal(q.state.proposta.relazione, 30);
  assert.deepEqual(q.meta.alleanza, { tipo: 'proposta', genere: 'alleanza', proposta, mappa: { accetta: true, rifiuta: false }, prudente: 'rifiuta' });
});
```

In `test/jev.test.js` aggiungi:

```js
test('Jev risponde anche alle proposte diplomatiche', async () => {
  const { propose } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame(1);
  const records = [];
  const ai = createJevAi({ ask: stubAsk, caratteri, onRecord: r => records.push(r) });
  propose(g, 'roma', 'alleanza', 'latini');
  advanceDay(g, { latini: ai.controller });
  await ai.flush();
  advanceDay(g, { latini: ai.controller });
  assert.ok(records.some(r => r.domande.some(d => d.domanda === 'alleanza' && d.fonte === 'jev' && d.scelta === 'accetta')));
  assert.deepEqual(g.nazioni.latini.alleati, ['roma']);
});
```

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implementa le regole**

In `rules.js`:
- importa da `../sim/diplomacy.js`: `relation, friendly, checkProposal, checkEmbassy`;
- in `warCandidates`, aggiungi al filtro `&& !friendly(game, id, o)`;
- in `legalWarTargets`, in testa: `if (n.protettore) return [];` (dopo `const n = ...`);
- sostituisci `strategy` con:

```js
export function strategy(game, id) {
  const inWar = Object.values(game.guerre).some(w => sideOf(w, id));
  if (inWar) return peaceProposals(game, id);
  const ult = ultimatumDecision(game, id);
  if (ult.length) return ult;
  const war = warDecision(game, id);
  return war.length ? war : diplomacyInitiatives(game, id);
}

// Contro un vicino molto più debole prima si chiede una provincia: se rifiuta, la guerra avrà un pretesto.
export function ultimatumDecision(game, id) {
  const ia = game.balance.diplomazia;
  const best = legalWarTargets(game, id)[0];
  if (!best || best.rapporto < ia.ultimatumRapporto || hasPretext(game, id, best.id)) return [];
  const prov = Object.values(game.province)
    .filter(p => !checkProposal(game, id, 'ultimatum', best.id, { provincia: p.id }))
    .sort((a, b) => b.tasse - a.tasse || (a.id < b.id ? -1 : 1))[0];
  return prov ? [{ tipo: 'proponi', nazione: id, genere: 'ultimatum', verso: best.id, provincia: prov.id }] : [];
}

export function diplomacyInitiatives(game, id) {
  const n = game.nazioni[id], d = game.balance.diplomazia, mine = power(game, id);
  if (n.protettore) return [];
  const byId = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const vicini = game.ordine.filter(o => o !== id && game.nazioni[o].vivo && bordersNation(game, id, o) && !atWar(game, id, o));
  const foedus = vicini.filter(o => !checkProposal(game, id, 'foedus', o)).sort(byId)[0];
  if (foedus) return [{ tipo: 'proponi', nazione: id, genere: 'foedus', verso: foedus }];
  if (vicini.some(o => power(game, o) > mine * 1.2 && !friendly(game, id, o))) {
    const amico = vicini
      .filter(o => power(game, o) <= mine * 1.2 && relation(game, id, o) >= d.alleanzaMinRelazione && !checkProposal(game, id, 'alleanza', o))
      .sort((a, b) => power(game, b) - power(game, a) || byId(a, b))[0];
    if (amico) return [{ tipo: 'proponi', nazione: id, genere: 'alleanza', verso: amico }];
  }
  const forte = vicini.filter(o => relation(game, id, o) < 50).sort((a, b) => power(game, b) - power(game, a) || byId(a, b))[0];
  if (forte && !checkEmbassy(game, id, forte) && n.tesoro >= d.ambasceriaCosto + game.balance.ia.riservaTesoro) {
    return [{ tipo: 'ambasceria', nazione: id, verso: forte }];
  }
  return [];
}
```

- sostituisci `answerProposals` con:

```js
// Pace: accetta ciò che riceve, cede solo se il costo non supera di 10 il vantaggio del nemico.
// Altri tipi: relazioni e rapporti di forze.
export function answerProposals(game, id) {
  const d = game.balance.diplomazia;
  const cmds = [];
  for (const p of Object.values(game.proposte)) {
    if (p.a !== id) continue;
    let accetta;
    switch (p.tipo) {
      case 'pace': {
        const war = game.guerre[p.guerra];
        accetta = p.termini.ricevente === id ||
          peaceCost(game, war, p.termini.ricevente, p.termini) <= -scoreFor(game, war, id) + 10;
        break;
      }
      case 'alleanza': accetta = relation(game, id, p.da) >= d.alleanzaMinRelazione; break;
      case 'foedus': accetta = relation(game, id, p.da) >= d.foedusMinRelazione; break;
      case 'tributo': accetta = power(game, p.da) >= 2 * power(game, id); break;
      case 'ultimatum': accetta = power(game, p.da) >= d.ultimatumRapporto * power(game, id); break;
      case 'chiamata': accetta = relation(game, id, p.da) >= d.chiamataMinRelazione; break;
      default: accetta = false;
    }
    cmds.push({ tipo: 'rispondi', nazione: id, proposta: p.id, accetta });
  }
  return cmds;
}
```

- [ ] **Step 3: Implementa le domande a Jev**

In `questions.js` aggiungi:

```js
import { relation } from '../sim/diplomacy.js';

const PROPOSTE = {
  alleanza: ['un\'alleanza', 'Allearsi: ci difenderemo a vicenda e potremo chiamarci in guerra.', 'Restare liberi da impegni.'],
  foedus: ['un foedus', 'Entrare nel foedus: protezione di un popolo più forte, ma niente guerre nostre e uomini ceduti ogni mese.', 'Restare indipendenti.'],
  tributo: ['un tributo', 'Pagare il tributo (il 20% delle entrate per 10 anni) per non dargli un pretesto di guerra.', 'Rifiutare il tributo: avrà un pretesto per attaccarci.'],
  ultimatum: ['una provincia', 'Cedere la provincia per evitare la guerra.', 'Rifiutare e prepararsi alla guerra: avrà un pretesto per attaccarci.'],
  chiamata: ['di entrare in guerra al suo fianco', 'Rispondere alla chiamata ed entrare in guerra con l\'alleato.', 'Restare fuori dalla guerra: l\'alleanza si rompe.']
};

export function buildProposalQuestion(game, propId, carattere) {
  const p = game.proposte[propId];
  if (p.tipo === 'pace') return buildPeaceQuestion(game, propId, carattere);
  const id = p.a, [cosa, si, no] = PROPOSTE[p.tipo];
  const state = statoPopolo(game, id, carattere);
  state.proposta = {
    da: nome(game, p.da), chiede: cosa,
    relazione: relation(game, id, p.da),
    rapporto_forze: round2(power(game, p.da) / Math.max(1, power(game, id))),
    ...(p.tipo === 'ultimatum' ? { provincia: game.province[p.provincia].nome } : {}),
    ...(p.tipo === 'chiamata' && game.guerre[p.guerra]
      ? { contro: enemiesOf(game.guerre[p.guerra], sideOf(game.guerre[p.guerra], p.da)).map(n => nome(game, n)).join(', ') } : {})
  };
  return {
    state,
    questions: {
      [p.tipo]: {
        type: 'choice',
        instructions: 'Sei il consiglio di `popolo.nome` e decidi secondo `popolo.carattere`. Guardando `proposta`, la relazione e il rapporto di forze, cosa rispondi?',
        criteria: { accetta: si, rifiuta: no }
      }
    },
    meta: { [p.tipo]: { tipo: 'proposta', genere: p.tipo, proposta: propId, mappa: { accetta: true, rifiuta: false }, prudente: 'rifiuta' } }
  };
}
```

In `jev.js`:
- importa `buildProposalQuestion` invece di `buildPeaceQuestion`, e `diplomacyInitiatives` da `./rules.js`;
- nel ciclo sulle proposte usa `buildProposalQuestion(game, p.id, caratteri[id] ?? '')`;
- in `applica`, il ramo `if (meta.tipo === 'pace')` diventa `if (meta.tipo === 'pace' || meta.tipo === 'proposta')`, con `const domanda = meta.genere ?? 'pace';` usato al posto della stringa `'pace'` nei `record.domande.push`;
- nel giorno di revisione: `if (inGuerra(game, id)) cmds.push(...peaceProposals(game, id)); else cmds.push(...diplomacyInitiatives(game, id));`;
- in `createReplayAi`, stessa modifica nel giorno di revisione.

In `views.js`, `DOMANDE` diventa:

```js
const DOMANDE = {
  guerra: 'Guerra?', obiettivo: 'Obiettivo degli eserciti', pace: 'Accettare la pace?',
  alleanza: 'Accettare l\'alleanza?', foedus: 'Accettare il foedus?', tributo: 'Pagare il tributo?',
  ultimatum: 'Cedere la provincia?', chiamata: 'Rispondere alla chiamata?'
};
```

- [ ] **Step 4: Verifica**

Run: `npm test`
Expected: PASS, 174 test. Se il rigioco (`rigioco dal registro`) fallisce, verifica che replay e Jev aggiungano `diplomacyInitiatives` negli stessi giorni.

Run: `node bench.js 50 3`
Expected: nessuna eccezione; annota nel registro quante guerre hanno più di due popoli e quante alleanze esistono alla fine (stampa con uno script nello scratchpad se serve).

- [ ] **Step 5: Commit**

```bash
git add public/js/ai/rules.js public/js/ai/questions.js public/js/ai/jev.js public/js/ui/views.js test/rules.test.js test/questions.test.js test/jev.test.js
git commit -m "feat: l'IA usa la diplomazia: risposte, iniziative, ultimatum, domande a Jev"
```

---

### Task 6: Diplomazia nell'interfaccia — *inline*

**Files:**
- Modify: `public/js/ui/views.js`, `public/js/ui/panels.js`, `public/js/ui/colors.js`, `public/js/main.js`, `public/css/style.css`, `tools/smoke.mjs`
- Test: `test/views.test.js` (sostituzione del test della diplomazia, aggiunte)

**Interfaces:**
- Produces:
  - `views.diplomacyView(game, g) → [{ id, nome, relazione, confina, stato, coalizione, azioni: { ambasceria, alleanza, rompi, foedus, tributo, guerra, ultimatum: { motivo, province: [{ id, nome }] }, costoGuerra } }]` (ogni azione = motivo per cui non si può, oppure `null`); ordinati: confinanti prima, poi per nome. `stato` in `guerra | tregua | alleato | federato | protettore | pace`.
  - `views.pendingProposals(game, g) → [{ id, da, titolo, testo }]` per ogni tipo.
  - `formatLogEntry`: `accordo` e `chiamata` diventano notizie.
  - `colors.js`: `RELAZIONE` con `alleato`, `federato`, `coalizione`; `relazioneStato(game, g, id)`; `provinceFill` e `fillSignature` le usano.
  - `panels.diplomaziaHtml(list)`, `panels.proposalHtml(p)` con `p.titolo`.
  - Azioni (`data-azione`): `ambasceria`, `alleanza`, `rompi`, `foedus`, `tributo`, `ultimatum` (legge `#ult-<id>`), `dichiara`.

- [ ] **Step 1: Test che falliscono**

In `test/views.test.js` sostituisci il test `diplomazia: vicini, stato, tregua` con:

```js
test('diplomazia: tutti i popoli, confinanti prima, stato, relazione, motivi', () => {
  const g = makeGame();
  let d = V.diplomacyView(g, 'roma');
  assert.deepEqual(d.map(x => [x.id, x.confina, x.stato, x.relazione]),
    [['latini', true, 'pace', 30], ['volsci', true, 'pace', 0], ['siculi', false, 'pace', 0]]);
  assert.equal(d[0].azioni.guerra, null);
  assert.equal(d[0].costoGuerra, 2);
  assert.equal(d[2].azioni.guerra, 'nessun confine');
  assert.equal(d[0].azioni.foedus, 'non abbastanza più forte');
  assert.deepEqual(d[0].azioni.ultimatum.province.map(p => p.id), ['d', 'e']);
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.equal(V.diplomacyView(g, 'roma')[1].stato, 'guerra');
  makePeace(g, guerra, 'roma', { province: [] });
  d = V.diplomacyView(g, 'roma');
  assert.equal(d[1].stato, 'tregua');
  assert.equal(d[1].azioni.guerra, 'tregua in corso');
  g.nazioni.roma.protettore = 'latini';
  d = V.diplomacyView(g, 'roma');
  assert.equal(d[0].stato, 'protettore');
  assert.equal(d[1].azioni.guerra, 'un federato non dichiara guerre');
});

test('proposte ricevute: titolo e testo per tipo', async () => {
  const { propose } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame();
  propose(g, 'roma', 'ultimatum', 'latini', { provincia: 'e' });
  propose(g, 'siculi', 'alleanza', 'latini');
  assert.deepEqual(V.pendingProposals(g, 'latini').map(p => [p.titolo, p.testo]), [
    ['Ultimatum', 'roma chiede la provincia di E. Se rifiuti avrà un pretesto per attaccarti.'],
    ['Alleanza', 'siculi propone un\'alleanza.']
  ]);
});

test('relazioni sulla mappa: alleati, federati, coalizione', async () => {
  const { changeRelation } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame();
  g.nazioni.roma.alleati = ['latini']; g.nazioni.latini.alleati = ['roma'];
  g.nazioni.siculi.protettore = 'roma';
  assert.equal(provinceFill(g, g.province.d, 'relazioni', 'roma'), RELAZIONE.alleato);
  assert.equal(provinceFill(g, g.province.g, 'relazioni', 'roma'), RELAZIONE.federato);
  g.nazioni.roma.infamia = 25;
  changeRelation(g, 'roma', 'volsci', -20);
  assert.equal(provinceFill(g, g.province.c, 'relazioni', 'roma'), RELAZIONE.coalizione);
});
```

E nel test `firma dei colori` aggiungi alla fine:

```js
  const prima = fillSignature(g, 'relazioni', 'roma');
  g.nazioni.roma.alleati = ['latini'];
  assert.notEqual(fillSignature(g, 'relazioni', 'roma'), prima);
```

Nota sul test "diplomazia": l'ultimatum ai Latini può chiedere `d` (confina con `a`) ed `e` (confina con `b`).

Run: `npm test`
Expected: FAIL.

- [ ] **Step 2: Implementa viste, colori e pannelli**

`views.js`:
- importa `relation, coalition, checkProposal, checkEmbassy, allied` da `../sim/diplomacy.js` e `checkWar` da `../sim/war.js`;
- sostituisci `diplomacyView`:

```js
export function diplomacyView(game, g) {
  const me = game.nazioni[g];
  const ostili = coalition(game, g);
  return game.ordine
    .filter(id => id !== g && game.nazioni[id].vivo)
    .map(id => {
      const altro = game.nazioni[id];
      const stato = atWar(game, g, id) ? 'guerra' : inTruce(game, g, id) ? 'tregua' : allied(game, g, id) ? 'alleato'
        : altro.protettore === g ? 'federato' : me.protettore === id ? 'protettore' : 'pace';
      const province = Object.values(game.province)
        .filter(p => !checkProposal(game, g, 'ultimatum', id, { provincia: p.id }))
        .map(p => ({ id: p.id, nome: p.nome }));
      return {
        id, nome: nome(game, id), relazione: relation(game, g, id), confina: bordersNation(game, g, id), stato,
        coalizione: ostili.includes(id),
        costoGuerra: hasPretext(game, g, id) ? 0 : game.balance.guerra.senzaPretesto,
        azioni: {
          ambasceria: checkEmbassy(game, g, id),
          alleanza: checkProposal(game, g, 'alleanza', id),
          rompi: allied(game, g, id) ? null : 'non siete alleati',
          foedus: checkProposal(game, g, 'foedus', id),
          tributo: checkProposal(game, g, 'tributo', id),
          guerra: checkWar(game, g, id),
          ultimatum: { motivo: province.length ? null : 'nessuna provincia da chiedere', province }
        }
      };
    })
    .sort((a, b) => Number(b.confina) - Number(a.confina) || byNome(a, b));
}
```

- sostituisci `pendingProposals`:

```js
const TITOLI = { pace: 'Proposta di pace', alleanza: 'Alleanza', foedus: 'Foedus', tributo: 'Tributo', ultimatum: 'Ultimatum', chiamata: 'Chiamata alle armi' };

export function pendingProposals(game, g) {
  return Object.values(game.proposte).filter(p => p.a === g).map(p => {
    const da = nome(game, p.da);
    let testo;
    if (p.tipo === 'pace') {
      const nomi = p.termini.province.map(id => game.province[id].nome).join(', ');
      if (!p.termini.province.length) testo = `${da} propone una pace bianca.`;
      else if (p.termini.ricevente === g) testo = `${da} offre la pace e ti cede: ${nomi}.`;
      else testo = `${da} chiede la pace e vuole: ${nomi}.`;
    } else if (p.tipo === 'alleanza') testo = `${da} propone un'alleanza.`;
    else if (p.tipo === 'foedus') testo = `${da} ti offre un foedus: protezione in cambio di obbedienza e di uomini.`;
    else if (p.tipo === 'tributo') testo = `${da} chiede un tributo: il 20% delle entrate per 10 anni. Se rifiuti avrà un pretesto per attaccarti.`;
    else if (p.tipo === 'ultimatum') testo = `${da} chiede la provincia di ${game.province[p.provincia].nome}. Se rifiuti avrà un pretesto per attaccarti.`;
    else {
      const w = game.guerre[p.guerra];
      const contro = w ? enemiesOf(w, sideOf(w, p.da)).map(n => nome(game, n)).join(', ') : '';
      testo = `${da} ti chiama alle armi contro ${contro}. Se rifiuti l'alleanza si rompe.`;
    }
    return { id: p.id, da, titolo: TITOLI[p.tipo], testo };
  });
}
```

- in `formatLogEntry` aggiungi i casi:

```js
    case 'accordo':
      return e.genere === 'ultimatum'
        ? `${N(e.a)} cede ${P(e.provincia)} a ${N(e.da)}.`
        : `${N(e.da)} e ${N(e.a)}: ${e.genere === 'alleanza' ? 'alleanza' : e.genere === 'foedus' ? 'foedus' : 'tributo'}.`;
    case 'chiamata': return `${N(e.nazione)} entra in guerra al fianco di ${N(e.alleato)}.`;
```

- aggiungi `hasPretext` all'import da `../sim/war.js`.

`colors.js`:

```js
import { allied, coalition } from '../sim/diplomacy.js';

export const RELAZIONE = {
  tu: '#d4a017', guerra: '#b03a2e', alleato: '#3f6fb0', federato: '#8fb3dd',
  coalizione: '#8a4b1c', tregua: '#e08e3c', neutrale: '#d9ccaa'
};

export function relazioneStato(game, g, id) {
  if (id === g) return 'tu';
  if (atWar(game, g, id)) return 'guerra';
  if (allied(game, g, id)) return 'alleato';
  if (game.nazioni[id].protettore === g || game.nazioni[g].protettore === id) return 'federato';
  if (coalition(game, g).includes(id)) return 'coalizione';
  if (inTruce(game, g, id)) return 'tregua';
  return 'neutrale';
}
```

In `provinceFill`, il ramo `relazioni` diventa `return giocatore ? RELAZIONE[relazioneStato(game, giocatore, prov.owner)] : RELAZIONE.neutrale;`. In `fillSignature`, il ciclo delle relazioni diventa `for (const id of game.ordine) s += relazioneStato(game, giocatore, id)[0] + relazioneStato(game, giocatore, id).length;` (basta che cambi quando cambia lo stato).

`panels.js`, sostituisci `diplomaziaHtml` e `proposalHtml`:

```js
const STATI = { guerra: 'in guerra', tregua: 'tregua', alleato: 'alleato', federato: 'tuo federato', protettore: 'tuo protettore', pace: 'in pace' };

function bottone(azione, id, testo, motivo) {
  return `<button class="piccolo" data-azione="${azione}" data-id="${esc(id)}"${motivo ? ` disabled title="${esc(motivo)}"` : ''}>${esc(testo)}</button>`;
}

export function diplomaziaHtml(list) {
  if (!list.length) return '<p class="muto">Nessun altro popolo.</p>';
  const riga = d => {
    const pct = Math.round((d.relazione + 200) / 4);
    return `<div class="dipl"><div class="riga"><span><b>${esc(d.nome)}</b> <span class="muto">${esc(STATI[d.stato])}` +
      `${d.coalizione ? ' · <span class="guerra">coalizione contro di te</span>' : ''}</span></span>` +
      `<span class="rel" title="relazione ${esc(d.relazione)}"><span style="width:${pct}%"></span></span></div>` +
      '<div class="comandi">' +
      bottone('ambasceria', d.id, 'Ambasceria', d.azioni.ambasceria) +
      (d.stato === 'alleato' ? bottone('rompi', d.id, 'Rompi alleanza', d.azioni.rompi) : bottone('alleanza', d.id, 'Alleanza', d.azioni.alleanza)) +
      bottone('foedus', d.id, 'Foedus', d.azioni.foedus) +
      bottone('tributo', d.id, 'Tributo', d.azioni.tributo) +
      (d.azioni.ultimatum.province.length
        ? `<select id="ult-${esc(d.id)}">${d.azioni.ultimatum.province.map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('')}</select>` +
          bottone('ultimatum', d.id, 'Ultimatum', null)
        : '') +
      bottone('dichiara', d.id, `Guerra${d.costoGuerra ? ` (−${d.costoGuerra} stab.)` : ''}`, d.azioni.guerra) +
      '</div></div>';
  };
  const vicini = list.filter(d => d.confina), altri = list.filter(d => !d.confina);
  return (vicini.length ? `<h3>Confinanti</h3>${vicini.map(riga).join('')}` : '') +
    (altri.length ? `<h3>Altri popoli</h3>${altri.map(riga).join('')}` : '');
}

export function proposalHtml(p) {
  return `<h3>${esc(p.titolo)}</h3><p>${esc(p.testo)}</p><div class="comandi">` +
    `<button data-azione="rispondi" data-id="${esc(p.id)}" data-accetta="1">Accetta</button>` +
    `<button data-azione="rispondi" data-id="${esc(p.id)}" data-accetta="0">Rifiuta</button></div>`;
}
```

`style.css`, in fondo:

```css
.dipl { padding: 4px 0 6px; border-bottom: 1px solid var(--riga); }
.dipl .riga { border: 0; padding: 2px 0; }
.rel { display: inline-block; width: 70px; height: 6px; background: #e2d4b4; border-radius: 3px; overflow: hidden; }
.rel span { display: block; height: 100%; background: linear-gradient(90deg, #b03a2e, #c9a227, #5f8f3a); }
button.piccolo { font-size: 12px; padding: 1px 6px; }
.dipl select { font: inherit; font-size: 12px; }
```

- [ ] **Step 3: Collega le azioni in `main.js`**

Nel gestore dei `data-azione` aggiungi:

```js
    case 'ambasceria': comando({ tipo: 'ambasceria', verso: id }); break;
    case 'alleanza':
    case 'foedus':
    case 'tributo': {
      const r = comando({ tipo: 'proponi', genere: el.dataset.azione, verso: id });
      if (r.ok) avviso('Proposta inviata.');
      break;
    }
    case 'ultimatum': {
      const r = comando({ tipo: 'proponi', genere: 'ultimatum', verso: id, provincia: $(`ult-${id}`).value });
      if (r.ok) avviso('Ultimatum inviato.');
      break;
    }
    case 'rompi': comando({ tipo: 'rompi_alleanza', con: id }); break;
```

- [ ] **Step 4: Prova di fumo**

In `tools/smoke.mjs`, prima di `// @@ controlli successivi @@`:

```js
  // --- diplomazia (tappa 4a)
  await page.goto(url);
  await page.waitForSelector('#inizio-lista .carta');
  await page.click('[data-popolo="roma"]');
  await page.selectOption('#inizio-ia', 'regole');
  await page.click('#inizio-via');
  await page.waitForSelector('#barra:not([hidden])');
  await page.click('[data-scheda="diplomazia"]');
  check((await page.textContent('#scheda')).includes('Confinanti'), 'diplomazia: confinanti in cima');
  check(await page.isDisabled('[data-azione="foedus"][data-id="veio"]'), 'foedus spento con il motivo');
  check((await page.getAttribute('[data-azione="foedus"][data-id="veio"]', 'title')).length > 0, 'il motivo è nel titolo del bottone');
  await page.evaluate(() => { window.universalis.ui.session.game.nazioni.roma.tesoro = 50; window.universalis.avanza(0); });
  await page.click('[data-azione="ambasceria"][data-id="veio"]');
  check(await page.evaluate(() => window.universalis.ui.session.game.nazioni.roma.relazioni.veio) === 25, 'ambasceria: relazione con Veio a 25');
  await page.click('[data-azione="alleanza"][data-id="lega_latina"]');
  check(await page.evaluate(() => Object.values(window.universalis.ui.session.game.proposte).some(p => p.tipo === 'alleanza' && p.a === 'lega_latina')), 'alleanza proposta ai Latini');
  await page.evaluate(async () => {
    const { propose } = await import('/js/sim/diplomacy.js');
    const g = window.universalis.ui.session.game;
    g.proposte = {};
    propose(g, 'veio', 'tributo', 'roma');
    window.universalis.avanza(1);
  });
  check((await page.textContent('#finestra')).includes('Tributo'), 'proposta di tributo al giocatore: finestra');
  await page.click('[data-azione="rispondi"][data-accetta="0"]');
  check(await page.evaluate(() => window.universalis.ui.session.game.nazioni.veio.pretesti.roma > 0), 'tributo rifiutato: Veio ha un pretesto');
  await page.evaluate(() => { const g = window.universalis.ui.session.game; g.nazioni.roma.protettore = 'lega_latina'; window.universalis.avanza(0); });
  check(await page.isDisabled('[data-azione="dichiara"][data-id="veio"]'), 'da federato non si dichiara guerra');
  await page.click('[data-modo="relazioni"]');
  await page.screenshot({ path: 'smoke-diplomazia.png' });

```

Run: `npm run smoke`
Expected: `smoke ok`. Guarda `smoke-diplomazia.png`: scheda Diplomazia leggibile, mappa delle relazioni con il protettore in azzurro.

Run: `npm test`
Expected: PASS, 176 test.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/views.js public/js/ui/panels.js public/js/ui/colors.js public/js/main.js public/css/style.css tools/smoke.mjs test/views.test.js
git commit -m "feat: diplomazia nell'interfaccia"
```

---

### Task 7: Bench, Jev, README — *inline*

- [ ] **Step 1: Bench a regole**

Run: `node bench.js 100 5`
Annota nel registro: tempo, popoli vivi, e (con uno script nello scratchpad che fa girare 100 anni con le regole e conta) alleanze attive alla fine, foedus, tributi, guerre con più di due popoli, ultimatum accettati e rifiutati. Se non nasce nessuna alleanza o nessuna guerra a più popoli, è un difetto: trovane la causa (soglie in `balance.json` → `diplomazia`) e correggi con un `Ruling:`.

- [ ] **Step 2: Jev su poco tempo**

Run: `node bench.js 10 1 misto bench-jev4a.jsonl`
Expected: richieste e costo stimato (atteso sotto 0,03 $). Con `node tools/jev-report.mjs bench-jev4a.jsonl` controlla che le domande `alleanza`, `tributo`, `ultimatum`, `chiamata` (se capitate) non siano tutte incerte o tutte uguali. Annota i numeri.

- [ ] **Step 3: README**

Nella sezione "Come si gioca" aggiungi:

```markdown
- **Diplomazia**: per ogni popolo vedi la relazione e cosa puoi fare (il motivo, se un bottone è spento): ambasceria, alleanza, foedus, tributo, ultimatum, guerra. Quando dichiari guerra i tuoi alleati vengono chiamati alle armi; quelli del nemico entrano da soli.
```

Commit `docs: README della tappa 4a`.
