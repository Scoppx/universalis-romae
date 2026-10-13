# Tappa 6: taratura — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raggiungere gli obiettivi di sopravvivenza per difficoltà (Roma facile davvero) e una letalità più bassa, e rendere Jev aggressivo quanto le regole, con leve nuove in `balance.json` tarate dal bench.

**Architecture:** Prima gli strumenti (riepilogo del bench con obiettivi ✓/✗), poi le leve come meccaniche con parametri (bonus per difficoltà, respiro iniziale, quota massima di una pace, stanchezza di guerra, protezione dei popoli nuovi, domanda di guerra di Jev riscritta), ciascuna con test sul comportamento. Infine il ciclo di taratura: si cambiano solo i numeri in `balance.json`, uno alla volta, misurando su 20 semi.

**Tech Stack:** Node 24 ES modules, `node --test`. Nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-10-12-universalis-romae-design.md`, sezione 14.

## Global Constraints

- Obiettivi (bench a regole, 100 anni, 20 semi): facile ≥ 80% vivo e province finali > iniziali; normale 50–65%; difficile 30–45%; molto difficile 15–30%; totale ≥ 55% dei popoli iniziali. Jev: guerre per popolo-anno entro un fattore 1,5 da quelle delle regole.
- I numeri si tarano in `public/data/balance.json`, non nel codice.
- Simulazione deterministica; comandi solo da `applyCommand`.
- `TYPESAFE_API_KEY` solo lato server; i revisori non chiamano TypeSafe.
- Testi e commenti in italiano.

## Review Focus

1. **Giocatore con un popolo facile**: il bonus vale anche per lui (esercito, tesoro, riserva, dado) e si vede nella scheda del popolo.
2. **Pace chiesta dal giocatore oltre la quota**: rifiutata con un motivo chiaro ("troppe province per una pace"), e i bottoni della scheda Guerre non permettono di inviarla.
3. **Salvataggi vecchi** senza `difficolta` nei popoli: la ricevono dai dati (o "normale" per i popoli nati durante la partita).
4. **Tregua dei popoli nuovi**: non si applica a chi era già in guerra con loro (un dormiente respinto resta in guerra con il vecchio padrone).
5. **Respiro iniziale**: vale per le regole e per i bersagli offerti a Jev, non per il giocatore.

Ogni voce ha il suo test nel task che possiede il codice (Task 2: 1, 3; Task 3: 2, 5; Task 4: 4).

---

### Task 1: Riepilogo del bench e obiettivi

**Files:**
- Modify: `bench.js`, `test/bench.test.js`

**Interfaces:**
- Produces: `OBIETTIVI` (esportato); `runBench(...)` restituisce anche `riepilogo = { perDifficolta: { [etichetta]: quotaViva }, totale, roma: { vivo, provinceInizio, provinceFine, punteggio }, guerre: { perAnno, durataMediaAnni, perPopoloAnno: { regole, jev } }, nuovi: { nati, vivi }, obiettivi: [{ nome, valore, atteso, ok }] }`; la tabella stampa il riepilogo sotto le righe.

- [ ] **Step 1: test che fallisce** — in `test/bench.test.js`:

```js
test('riepilogo del bench: difficoltà, Roma, guerre, popoli nuovi, obiettivi', async () => {
  const { riepilogo: r } = await runBench({ anni: 3, semi: 1 });
  assert.deepEqual(Object.keys(r.perDifficolta).sort(), ['difficile', 'facile', 'molto difficile', 'normale']);
  assert.ok(r.totale > 0 && r.totale <= 1);
  assert.equal(r.roma.provinceInizio, 1);
  assert.ok(r.guerre.perAnno >= 0 && r.guerre.perPopoloAnno.regole >= 0);
  assert.equal(r.guerre.perPopoloAnno.jev, null); // nessun popolo con Jev
  assert.ok(r.nuovi.nati >= 0);
  assert.deepEqual(r.obiettivi.map(o => o.nome), ['facile', 'Roma cresce', 'normale', 'difficile', 'molto difficile', 'totale']);
  assert.ok(r.obiettivi.every(o => typeof o.ok === 'boolean'));
});
```

- [ ] **Step 2: verificare che fallisca** — Run: `node --test test/bench.test.js`. Expected: FAIL (`riepilogo` undefined).

- [ ] **Step 3: bench.js**
  - in cima, dopo gli import:

```js
// Obiettivi della tappa 6 (bench a regole, 100 anni, 20 semi): quota di popoli vivi per difficoltà e in totale.
export const OBIETTIVI = { facile: [0.8, 1], normale: [0.5, 0.65], difficile: [0.3, 0.45], 'molto difficile': [0.15, 0.3], totale: [0.55, 1] };
```
  - in `runBench`, accumulatori `const g6 = { guerre: 0, durate: [], dichiarate: { regole: 0, jev: 0 }, anniPopolo: { regole: 0, jev: 0 }, nati: 0, nuoviVivi: 0 };`; nel ciclo dei giorni, al posto di `advanceDay(game, controllers);`:

```js
      for (const e of advanceDay(game, controllers)) {
        if (e.tipo === 'guerra') {
          g6.guerre++;
          inizio[e.guerra] = game.day;
          g6.dichiarate[controllers[e.attaccante] === rulesController ? 'regole' : 'jev']++;
        } else if (e.tipo === 'pace' && inizio[e.guerra] !== undefined) {
          g6.durate.push((game.day - inizio[e.guerra]) / 365);
        } else if (e.tipo === 'nascita' || (e.tipo === 'indipendenza' && e.a.startsWith('liberi_'))) {
          g6.nati++; // risvegli e popoli nati da un'indipendenza
        }
      }
      if (game.day % 365 === 0) {
        for (const id of game.ordine) if (game.nazioni[id].vivo) g6.anniPopolo[controllers[id] === rulesController ? 'regole' : 'jev']++;
      }
```
  (con `const inizio = {};` per seme, prima del ciclo).
  - a fine seme: `g6.nuoviVivi += game.ordine.filter(id => start[id] === undefined && game.nazioni[id].vivo).length;`.
  - dopo le righe:

```js
  const originali = righe.filter(r => r.difficolta !== 'nuovo');
  const media = list => list.length ? list.reduce((s, r) => s + r.vivo, 0) / list.length : null;
  const perDifficolta = Object.fromEntries(['facile', 'normale', 'difficile', 'molto difficile'].map(d => [d, media(originali.filter(r => r.difficolta === d))]));
  const roma = righe.find(r => r.id === 'roma');
  const perPA = k => (g6.anniPopolo[k] ? g6.dichiarate[k] / g6.anniPopolo[k] : null);
  const riepilogo = {
    perDifficolta, totale: media(originali),
    roma: { vivo: roma.vivo, provinceInizio: roma.provinceInizio, provinceFine: roma.provinceFine, punteggio: roma.punteggio },
    guerre: {
      perAnno: g6.guerre / (anni * semi),
      durataMediaAnni: g6.durate.length ? g6.durate.reduce((s, x) => s + x, 0) / g6.durate.length : 0,
      perPopoloAnno: { regole: perPA('regole'), jev: perPA('jev') }
    },
    nuovi: { nati: g6.nati / semi, vivi: g6.nuoviVivi / semi }
  };
  const dentro = (v, [lo, hi]) => v !== null && v >= lo && v <= hi;
  riepilogo.obiettivi = [
    { nome: 'facile', valore: perDifficolta.facile, atteso: OBIETTIVI.facile, ok: dentro(perDifficolta.facile, OBIETTIVI.facile) },
    { nome: 'Roma cresce', valore: roma.provinceFine, atteso: [roma.provinceInizio, Infinity], ok: roma.provinceFine > roma.provinceInizio },
    ...['normale', 'difficile', 'molto difficile'].map(d => ({ nome: d, valore: perDifficolta[d], atteso: OBIETTIVI[d], ok: dentro(perDifficolta[d], OBIETTIVI[d]) })),
    { nome: 'totale', valore: riepilogo.totale, atteso: OBIETTIVI.totale, ok: dentro(riepilogo.totale, OBIETTIVI.totale) }
  ];
  return { righe, totali, riepilogo };
```
  - `table`: dopo le righe dei popoli,

```js
  const p = v => (v === null ? '—' : `${Math.round(v * 100)}%`);
  const r = res.riepilogo;
  lines.push('', 'Obiettivi:');
  for (const o of r.obiettivi) lines.push(`  ${o.ok ? '✓' : '✗'} ${o.nome.padEnd(16)} ${o.nome === 'Roma cresce' ? `${o.valore.toFixed(1)} province` : p(o.valore)}` +
    (o.nome === 'Roma cresce' ? '' : `  (atteso ${p(o.atteso[0])}–${p(o.atteso[1])})`));
  lines.push(`Roma: viva ${p(r.roma.vivo)}, province ${r.roma.provinceInizio.toFixed(1)} → ${r.roma.provinceFine.toFixed(1)}, punteggio ${r.roma.punteggio.toFixed(1)}`);
  lines.push(`Guerre: ${r.guerre.perAnno.toFixed(2)} l'anno, durata media ${r.guerre.durataMediaAnni.toFixed(1)} anni, per popolo-anno regole ${r.guerre.perPopoloAnno.regole?.toFixed(3) ?? '—'} · Jev ${r.guerre.perPopoloAnno.jev?.toFixed(3) ?? '—'}`);
  lines.push(`Popoli nuovi: ${r.nuovi.nati.toFixed(1)} nati per partita, ${r.nuovi.vivi.toFixed(1)} vivi alla fine`);
```
  (la firma diventa `function table(res, anni, semi, ia, ms)` con `const { righe, totali } = res;`).

- [ ] **Step 4: verificare** — Run: `node --test test/bench.test.js`. Expected: PASS. Run: `node bench.js 100 20 regole > <workspace>/base.txt` e salvare nel registro il riepilogo di partenza (Roma, per difficoltà, totale, guerre, popoli nuovi, tempo). `npm test` (log). Expected: verde (257).

- [ ] **Step 5: commit** — `git commit -am "feat: riepilogo del bench con gli obiettivi della taratura"`.

---

### Task 2: Bonus per difficoltà

**Files:**
- Modify: `public/data/balance.json`, `public/js/sim/state.js`, `public/js/sim/setup.js`, `public/js/sim/combat.js`, `public/js/sim/dormant.js`, `public/js/sim/culture.js` (`spawnNation`), `public/js/ui/save.js`, `public/js/ui/views.js` (`peopleCards`), `public/js/ui/panels.js` (`cardDetailHtml`), `test/fixtures.js`, `test/government.test.js`, `test/save.test.js`, `test/views.test.js`

**Interfaces:**
- Produces: `balance.difficolta = { [etichetta]: { esercito, tesoro, uomini, dado } }`; campo `difficolta` in ogni popolo dello stato e nei dormienti; `difficultyOf(game, id) → { esercito, tesoro, uomini, dado }` (state.js, valori mancanti = neutri); `peopleCards` con `bonus` (testo).

- [ ] **Step 1: balance.json** — valori di partenza (si tarano nel Task 6):

```json
  "difficolta": {
    "facile": { "esercito": 1.5, "tesoro": 2, "uomini": 1.5, "dado": 1 },
    "normale": {},
    "difficile": { "esercito": 0.9, "tesoro": 1, "uomini": 0.9, "dado": 0 },
    "molto difficile": { "esercito": 0.8, "tesoro": 0.8, "uomini": 0.8, "dado": 0 }
  },
```

- [ ] **Step 2: test che falliscono**
  - `test/fixtures.js`: `N` mette `difficolta: 'normale'` (già presente) — invariato; i test scelgono l'etichetta a mano.
  - `test/government.test.js`:

```js
test('difficoltà: esercito, tesoro, riserva iniziali e dado', () => {
  const base = makeGame();
  const pop = structuredClone(fixturePopoli);
  pop.popoli.find(p => p.id === 'roma').difficolta = 'facile';
  const g = createGame({ map: fixtureMap, popoli: pop, balance, seed: 1 });
  const d = balance.difficolta.facile;
  assert.equal(g.nazioni.roma.difficolta, 'facile');
  const fanti = a => armiesOf(a, 'roma')[0].fanteria;
  assert.equal(fanti(g), Math.round(fanti(base) * d.esercito));
  assert.ok(Math.abs(g.nazioni.roma.tesoro - base.nazioni.roma.tesoro * d.tesoro) < 1e-9);
  assert.equal(g.nazioni.roma.uomini, Math.round(base.nazioni.roma.uomini * d.uomini));
  const a = createArmy(g, 'roma', 'c', 1000, 0), b = createArmy(base, 'roma', 'c', 1000, 0);
  assert.equal(battleModifier(g, g.province.c, [a]), battleModifier(base, base.province.c, [b]) + d.dado);
  assert.equal(base.nazioni.latini.difficolta, 'normale');
});
```
  (import `createGame`, `fixtureMap`, `fixturePopoli`, `balance`, `armiesOf`.) Le uguaglianze sull'esercito e la riserva valgono a meno di arrotondamenti: se il prodotto non è intero si confronta con `Math.round` sul valore calcolato come nel codice (Step 3), con una riga `Ruling:` se serve.
  - `test/save.test.js`:

```js
test('salvataggio vecchio senza difficoltà: la riceve dai dati, normale per i popoli nati in partita', () => {
  const s = createSession(data, 'roma', 1);
  const old = JSON.parse(serialize(s));
  for (const n of Object.values(old.game.nazioni)) delete n.difficolta;
  for (const d of Object.values(old.game.dormienti)) delete d.difficolta;
  const r = deserialize(JSON.stringify(old), data);
  assert.equal(r.ok, true, r.motivo);
  assert.equal(r.session.game.nazioni.roma.difficolta, 'facile');
  assert.equal(r.session.game.dormienti.taranto.difficolta, data.popoli.popoli.find(p => p.id === 'taranto').difficolta);
});
```
  - `test/views.test.js`: `V.peopleCards(loadData().popoli)` — la carta di Roma ha `bonus` che contiene `esercito +50%` e `+1 al dado`; una carta "normale" ha `bonus: ''`.

- [ ] **Step 3: verificare che falliscano** — Run: `node --test test/government.test.js test/save.test.js test/views.test.js`. Expected: FAIL.

- [ ] **Step 4: codice**
  - `state.js`:

```js
// Bonus della difficoltà del popolo (balance.difficolta): normale e valori mancanti sono neutri.
export function difficultyOf(game, id) {
  const d = game.balance.difficolta?.[game.nazioni[id]?.difficolta] ?? {};
  return { esercito: d.esercito ?? 1, tesoro: d.tesoro ?? 1, uomini: d.uomini ?? 1, dado: d.dado ?? 0 };
}
```
  - `setup.js`: nel popolo `difficolta: n.difficolta ?? 'normale'`; nei dormienti `difficolta: n.difficolta ?? 'normale'`; nel ciclo iniziale `const d = difficultyOf(game, id);` e tesoro `* d.tesoro`, riserva `Math.round(maxManpower(game, id) * balance.inizio.riservaQuota * d.uomini)`, esercito `Math.round(uomini * balance.inizio.fanteriaPerUomo * bonus * d.esercito)` (e cavalleria uguale).
  - `combat.js` `battleModifier`: `m += difficultyOf(game, owner).dado;` (i ribelli non hanno difficoltà: neutri).
  - `dormant.js`: il popolo risvegliato prende `difficolta: d.difficolta ?? 'normale'` e applica `difficultyOf` a tesoro, riserva ed esercito come in `setup.js`.
  - `culture.js` `spawnNation`: `difficolta: 'normale'`.
  - `save.js`: validazione `n.difficolta` e `d.difficolta` stringhe se presenti; migrazione dopo `initCulture(g)`:

```js
  const info = Object.fromEntries(data.popoli.popoli.map(p => [p.id, p]));
  for (const id of g.ordine) g.nazioni[id].difficolta ??= info[id]?.difficolta ?? 'normale';
  for (const d of Object.values(g.dormienti)) d.difficolta ??= info[d.id]?.difficolta ?? 'normale';
```
  (la migrazione dei dormienti va dopo la loro creazione per i salvataggi della tappa 4.)
  - `views.js` `peopleCards`: `bonus: formatBonus(balance.difficolta?.[p.difficolta])` — ma `peopleCards` riceve solo `popoli`: la firma diventa `peopleCards(popoli, balance)` e `main.js` passa `data.balance`; `formatBonus(d)` produce, per i valori diversi da neutro, `esercito +50%`, `tesoro ×2`, `riserva +50%`, `+1 al dado` separati da virgola (`''` se neutro).
  - `panels.js` `cardDetailHtml`: se `c.bonus`, una riga `<div class="muto">Bonus della difficoltà: …</div>`.

- [ ] **Step 5: verificare** — Run: `node --test test/government.test.js test/save.test.js test/views.test.js`. Expected: PASS. `npm test` (log). Expected: verde. `node bench.js 100 20 regole` e riepilogo nel registro (effetto del solo bonus).

- [ ] **Step 6: commit** — `git commit -am "feat: bonus per difficoltà (esercito, tesoro, riserva, dado)"`.

---

### Task 3: Leve contro la letalità

**Files:**
- Modify: `public/data/balance.json`, `public/js/sim/war.js` (`validTerms`), `public/js/ai/rules.js` (`legalWarTargets`, `peaceProposals`, `answerProposals`), `public/js/ui/views.js` (`warsView`), `test/war.test.js`, `test/rules.test.js`, `test/views.test.js`

**Interfaces:**
- Produces: `balance.guerra.quotaPace` (quota massima delle province di un popolo cedibili in una pace), `balance.ia.anniDiRespiro`, `balance.ia.stanchezzaAnni`; `maxCedibili(game, owner) → n` (war.js); motivo `'troppe province per una pace'`; `warsView` con `maxChiedibili`.

- [ ] **Step 1: balance.json** — valori di partenza: `guerra.quotaPace: 0.5`, `ia.anniDiRespiro: 5`, `ia.stanchezzaAnni: 8`.

- [ ] **Step 2: test che falliscono**
  - `test/war.test.js`:

```js
test('una pace non prende più della quota delle province di un popolo', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.guerra.quotaPace = 0.5;
  const { guerra } = declareWar(g, 'roma', 'latini');
  g.province.d.controller = 'roma';
  g.province.e.controller = 'roma';
  const w = g.guerre[guerra];
  assert.equal(validTerms(g, w, 'roma', { province: ['d', 'e'] }), 'troppe province per una pace'); // 2 su 2
  assert.equal(validTerms(g, w, 'roma', { province: ['d'] }), null);
  g.balance.guerra.quotaPace = 1;
  assert.equal(validTerms(g, w, 'roma', { province: ['d', 'e'] }), null);
});

test('un popolo con una provincia sola può perderla (quota minima una)', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.guerra.quotaPace = 0.5;
  const { guerra } = declareWar(g, 'volsci', 'siculi');
  g.province.g.controller = 'volsci';
  assert.equal(validTerms(g, g.guerre[guerra], 'volsci', { province: ['g'] }), null);
});
```
  - `test/rules.test.js`:

```js
test('respiro iniziale: niente bersagli per le regole né per Jev nei primi anni', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.ia.anniDiRespiro = 5;
  assert.deepEqual(legalWarTargets(g, 'roma'), []);
  assert.deepEqual(warDecision(g, 'roma'), []);
  assert.equal(applyCommand(g, { tipo: 'dichiara_guerra', nazione: 'roma', contro: 'volsci' }).ok, true); // il giocatore può
  g.day = 5 * 365;
  assert.ok(legalWarTargets(g, 'latini').length > 0);
});

test('stanchezza: dopo anni di guerra le regole propongono e accettano la pace bianca', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.ia.stanchezzaAnni = 8;
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.guerre[guerra].battaglie = 20; // roma vince di 20
  g.day = 8 * 365;
  assert.ok(peaceProposals(g, 'volsci').some(c => c.termini.province.length === 0));
  proposePeace(g, 'volsci', guerra, { ricevente: 'volsci', province: [] });
  assert.equal(answerProposals(g, 'roma').find(c => c.tipo === 'rispondi').accetta, true);
  g.day = 7 * 365;
  assert.equal(answerProposals(g, 'roma').find(c => c.tipo === 'rispondi').accetta, false);
});
```
  (import `applyCommand`, `peaceProposals`, `answerProposals` se mancano.)
  - `test/views.test.js`: in guerra con i latini e con `d`, `e` occupate, `warsView(g, 'roma')[0].maxChiedibili === 1` con `quotaPace` 0,5.

- [ ] **Step 3: verificare che falliscano** — Run: `node --test test/war.test.js test/rules.test.js test/views.test.js`. Expected: FAIL.

- [ ] **Step 4: codice**
  - `war.js`:

```js
// Quante province di un popolo può prendere una sola pace: almeno una, al più la quota delle sue province.
export function maxCedibili(game, owner) {
  return Math.max(1, Math.floor(provincesOf(game, owner).length * (game.balance.guerra.quotaPace ?? 1)));
}
```
    In `validTerms`, dopo il ciclo sulle province: conteggio per padrone (`const per = {}; for (const id of termini.province) per[game.province[id].owner] = (per[...] ?? 0) + 1;`) e `if (Object.entries(per).some(([o, k]) => k > maxCedibili(game, o))) return 'troppe province per una pace';`.
  - `rules.js`:
    - `legalWarTargets`: `if (game.day < game.balance.ia.anniDiRespiro * 365) return [];` (Jev riceve i bersagli da qui; il giocatore non passa da qui).
    - `peaceProposals`: le scelte di province rispettano la quota (si aggiunge una provincia solo se `!validTerms(...)` con la lista nuova; per la resa uguale); la pace bianca parte anche quando `game.day - war.inizio >= ia.stanchezzaAnni * 365`, qualunque sia il punteggio, se il popolo non sta vincendo abbastanza da chiedere province (ramo dopo quello delle richieste).
    - `answerProposals` caso `pace`: `accetta ||= p.termini.province.length === 0 && game.day - war.inizio >= ia.stanchezzaAnni * 365;`.
  - `views.js` `warsView`: `maxChiedibili: maxCedibili(game, nemico.id)` per lo schieramento nemico (il capofila), e nel pannello la riga "Al più N province per pace" (`panels.js` `guerreHtml`, testo semplice).

- [ ] **Step 5: verificare** — Run: `node --test test/war.test.js test/rules.test.js test/views.test.js`. Expected: PASS. `npm test` (log). Expected: verde. Bench 100×20 a regole: riepilogo nel registro. I test vecchi che si aspettano una guerra delle regole al giorno 0 cadono per il respiro iniziale: si portano a `g.day = 5 * 365` o si mette `anniDiRespiro` a 0 nella loro partita, con una riga `Ruling:` (misurano la scelta del bersaglio, non il respiro).

- [ ] **Step 6: commit** — `git commit -am "feat: quota massima per pace, respiro iniziale, stanchezza di guerra"`.

---

### Task 4: Protezione dei popoli nuovi

**Files:**
- Modify: `public/data/balance.json`, `public/js/sim/culture.js` (`independence`, `spawnNation`), `public/js/sim/dormant.js`, `test/rebels.test.js`, `test/dormant.test.js`

**Interfaces:**
- Produces: `balance.nuoviPopoli = { tregua: giorni, esercito: moltiplicatore }`; `protectNewborn(game, id)` (culture.js): tregua con tutti i popoli confinanti con cui non è in guerra.

- [ ] **Step 1: balance.json** — `"nuoviPopoli": { "tregua": 1825, "esercito": 1.5 }`.

- [ ] **Step 2: test che falliscono**
  - `test/rebels.test.js`:

```js
test('un popolo nato da un\'indipendenza ha tregua con i confinanti e un esercito più grande', () => {
  const g = makeGame();
  const r = soloRibelli(g, 'b', 1000);
  g.province.b.cultura = 'etrusca';
  g.province.b.controller = RIBELLI;
  independence(g, 'b');
  const nuovo = g.province.b.owner;
  for (const o of ['roma', 'latini', 'volsci']) assert.ok(g.nazioni[nuovo].tregue[o] > g.day && g.nazioni[o].tregue[nuovo] > g.day, o);
  assert.equal(g.eserciti[r.id].fanteria, Math.round(1000 * g.balance.nuoviPopoli.esercito));
});
```
  - `test/dormant.test.js`:

```js
test('un dormiente accolto ha tregua con i confinanti; uno respinto resta in guerra con il vecchio padrone', () => {
  const g = makeGame();
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  activateDormant(g, 'taranto', { esercito: 2, guerra: true });
  assert.equal(atWar(g, 'taranto', 'siculi'), true);
  assert.equal(g.nazioni.taranto.tregue.siculi ?? -1, -1); // nessuna tregua con chi lo combatte
  const h = makeGame();
  h.province.f.owner = 'siculi'; h.province.f.controller = 'siculi';
  activateDormant(h, 'taranto', { esercito: 1 });
  assert.ok(h.nazioni.taranto.tregue.siculi > h.day);
});
```

- [ ] **Step 3: verificare che falliscano** — Run: `node --test test/rebels.test.js test/dormant.test.js`. Expected: FAIL.

- [ ] **Step 4: codice**
  - `culture.js`:

```js
// Un popolo appena nato ha qualche anno di tregua con i confinanti con cui non è già in guerra.
export function protectNewborn(game, id) {
  const fine = game.day + game.balance.nuoviPopoli.tregua;
  for (const o of game.ordine) {
    if (o === id || !game.nazioni[o].vivo || atWar(game, id, o) || !bordersNation(game, id, o)) continue;
    game.nazioni[id].tregue[o] = Math.max(game.nazioni[id].tregue[o] ?? -1, fine);
    game.nazioni[o].tregue[id] = Math.max(game.nazioni[o].tregue[id] ?? -1, fine);
  }
}
```
    In `independence`: al posto della tregua solo con il vecchio padrone, dopo il passaggio della provincia e degli eserciti, se il popolo è nuovo: gli eserciti ribelli passati moltiplicano fanteria e cavalleria per `nuoviPopoli.esercito` (arrotondate) e si chiama `protectNewborn(game, nuovo)`.
  - `dormant.js`: dopo l'eventuale `startWar`, `protectNewborn(game, popolo)` (salta da sé chi è già in guerra).

- [ ] **Step 5: verificare** — Run: `node --test test/rebels.test.js test/dormant.test.js`. Expected: PASS. `npm test` (log). Expected: verde (il vecchio test "indipendenza senza vicini … con tregua" resta valido). Bench 100×20: riepilogo nel registro.

- [ ] **Step 6: commit** — `git commit -am "feat: tregua e esercito più grande per i popoli appena nati"`.

---

### Task 5: Domanda di guerra di Jev

**Files:**
- Modify: `public/js/ai/questions.js` (`buildReview`), `test/questions.test.js`

**Interfaces:**
- Produces: in `state.vicini_attaccabili` i campi `province` e `tasse`; criteri di guerra con guadagno e rischio; criterio di pace neutro.

- [ ] **Step 1: test che fallisce** — in `test/questions.test.js`:

```js
test('domanda di guerra: guadagno e rischio per ogni bersaglio, la pace non è la scelta saggia per definizione', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.ia.anniDiRespiro = 0;
  const q = buildReview(g, 'roma', 'Ambiziosa.');
  const c = q.questions.guerra.criteria;
  assert.equal(c['nessuna guerra'], 'Restare in pace per ora e rafforzarsi: nessuna conquista, ma nessun rischio.');
  assert.match(c.volsci, /conquistare/);
  assert.match(c.volsci, /2 province, tasse 2/);
  assert.match(c.volsci, /rischio/);
  assert.deepEqual(q.state.vicini_attaccabili.find(v => v.nome === 'volsci').province, 2);
});
```

- [ ] **Step 2: verificare che fallisca** — Run: `node --test test/questions.test.js`. Expected: FAIL.

- [ ] **Step 3: codice** — in `buildReview`:
  - `vicini_attaccabili` aggiunge `province: provincesOf(game, c.id).length, tasse: sumOf(provincesOf(game, c.id), 'tasse')`;
  - criterio di pace: `'Restare in pace per ora e rafforzarsi: nessuna conquista, ma nessun rischio.'`;
  - criterio di guerra:

```js
      const prov = provincesOf(game, c.id), tasse = sumOf(prov, 'tasse');
      const rischio = c.rapporto >= 2 ? 'rischio basso' : c.rapporto >= 1.3 ? 'rischio medio' : 'rischio alto';
      criteria[N] = `Dichiarare guerra a ${N} per conquistare le sue terre (${prov.length} province, tasse ${tasse}): ` +
        `le nostre forze sono ${round2(c.rapporto)} volte le sue, ${rischio}` +
        (hasPretext(game, id, c.id) ? ', e abbiamo un pretesto.' : '; senza pretesto perdiamo stabilità.');
```
  (import `provincesOf, sumOf` da `state.js`.) Il test vecchio sulle chiavi delle opzioni (`['nessuna guerra', 'volsci', 'latini']`) resta valido se imposta `anniDiRespiro` a 0: se cade per il respiro iniziale lo si adatta così, con una riga `Ruling:`.

- [ ] **Step 4: verificare** — Run: `node --test test/questions.test.js test/jev.test.js`. Expected: PASS. `npm test` (log). Expected: verde.

- [ ] **Step 5: commit** — `git commit -am "feat: la domanda di guerra a Jev dice guadagno e rischio"`.

---

### Task 6: Ciclo di taratura

**Files:**
- Modify: `public/data/balance.json` (solo numeri); eventualmente `public/data/eventi/*.json` (solo probabilità) se gli eventi negativi pesano troppo su Roma.

- [ ] **Step 1: metodo** — per ogni iterazione: un'ipotesi scritta nel registro (`Taratura N: ipotesi …`), una modifica a uno o due numeri, `node bench.js 100 20 regole > <workspace>/tN.txt`, riepilogo nel registro (`Taratura N: … → facile x%, normale y%, difficile z%, molto difficile w%, totale t%, Roma province a → b, guerre per popolo-anno g, ✓k/6`), e la decisione (tenuta o tolta). Ordine consigliato delle leve: `difficolta.facile` (Roma), `guerra.quotaPace`, `ia.stanchezzaAnni`, `ia.rapportoGuerra`, `difficolta` degli altri livelli, `nuoviPopoli`, `ia.anniDiRespiro`; poi, se Roma resta sotto obiettivo per gli eventi, le probabilità di `pestilenza` e `carestia`.

- [ ] **Step 2: criterio d'arresto** — si chiude quando i 6 obiettivi sono ✓ in una corsa da 20 semi e si confermano in una seconda corsa da 20 semi con semi diversi (`node bench.js 100 20 regole` usa i semi 1-20: per la conferma aggiungere a `bench.js` un quinto argomento opzionale `primoSeme`, con un test che due corse con `primoSeme` diversi danno righe diverse), oppure dopo 12 iterazioni: in quel caso si tiene la migliore e le soglie mancate si dichiarano nel registro con i numeri.

- [ ] **Step 3: verificare** — `npm test` (log). Expected: verde (i test con numeri esatti usano la fixture e il bilanciamento può cambiarli: se un test vecchio misura un numero di bilanciamento invece di un comportamento, lo si riscrive per leggere il valore da `balance`, con una riga `Ruling:`).

- [ ] **Step 4: commit** — un commit per ogni modifica tenuta: `git commit -am "taratura: <leva> <vecchio> → <nuovo> (<effetto misurato>)"`.

---

### Task 7: Jev, misura reale, README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Jev reale** — con `TYPESAFE_API_KEY`: `node bench.js 30 2 misto <workspace>/jev.jsonl`. Dal riepilogo: guerre per popolo-anno di Jev e delle regole. Obiettivo: rapporto Jev/regole tra 0,67 e 1,5. Se Jev resta sotto, una sola correzione del testo della domanda (Task 5) e una seconda misura; il risultato va nel registro in ogni caso. Senza chiave: `Ruling:` che rimanda la misura.

- [ ] **Step 2: README** — sezione "Difficoltà": i bonus per etichetta, gli obiettivi del bench, `node bench.js 100 20 regole` e come leggere il riepilogo; le leve di `balance.json` (`quotaPace`, `anniDiRespiro`, `stanchezzaAnni`, `nuoviPopoli`, `difficolta`) con una riga ciascuna.

- [ ] **Step 3: verificare** — `npm test`, `npm run smoke`. Expected: verdi.

- [ ] **Step 4: commit** — `git commit -am "docs: README della tappa 6"`.
