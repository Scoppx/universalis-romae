# Tappa 7: battaglie e assedi visibili — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** L'IA unisce i suoi eserciti e la mappa non mostra file infinite; il giocatore vede in diretta le battaglie dei suoi eserciti e può ritirarsi; gli assedi hanno un presidio, finiscono a giorni contati e si possono assaltare.

**Architecture:** Simulazione: `sim/siege.js` passa da una probabilità giornaliera a punti d'assedio per provincia (`p.assedio = { nazione, punti }`), con `presidio(game, prov)`, `siegeRate`, `daysLeft`, `assaultChance` e il comando `assalto`; `sim/combat.js` riceve il comando `ritirata` (dalla battaglia); `sim/armies.js` il comando `ripiega` (marcia verso la provincia sicura più vicina) e `mergeIdle` per l'IA. Interfaccia: riquadri delle battaglie in `#battaglie`, simbolo d'assedio sulla mappa con la finestra dell'assedio, riquadro d'assedio nella scheda della provincia.

**Tech Stack:** Node 24 ES modules, Canvas 2D, `node --test`, playwright-core. Nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-10-12-universalis-romae-design.md`, sezione 15 (obiettivi della sezione 14).

## Global Constraints

- Simulazione deterministica: numeri casuali solo da `game.rng`; gli assalti tirano un solo `nextRandom`.
- Comandi solo da `applyCommand`; ogni bottone ha `title` (attivo: cosa fa; spento: perché).
- Numeri in `balance.json`: `assedio.presidioPerUomo` 250, `assedio.assaltoPerditaVittoria` 0.5 (del presidio), `assedio.assaltoPerditaSconfitta` 0.2, `combattimento.ritirataPerdita` 0.1, `ia.assaltoSoglia` 0.75.
- Obiettivi della sezione 14 da riverificare alla fine (due corse da 20 semi).

## Review Focus

1. **Assedianti di più popoli dello stesso schieramento** nella stessa provincia: un solo assedio, a chi va la provincia (chi ha più uomini lì), alleato che libera una provincia dai ribelli (regola esistente).
2. **Assedio interrotto**: un nemico arriva (battaglia), gli assedianti partono o muoiono → i punti si azzerano; la pace azzera gli assedi delle province restituite.
3. **Ritirata senza province sicure**: l'esercito si scioglie (come oggi dopo una sconfitta): il `title` del bottone lo dice.
4. **Salvataggi** con `p.assedio` e senza (vecchi).
5. **Riquadri delle battaglie** dopo un caricamento o con più battaglie insieme; scompaiono a fine battaglia.

---

### Task 1: L'IA unisce gli eserciti; mappa con al più 3 soldatini per popolo

- `armies.js`: `mergeIdle(game, id)` unisce gli eserciti di `id` fermi (né in marcia né in battaglia) nella stessa provincia; restituisce i comandi `unisci` da eseguire (così passa da `applyCommand`): `[{ tipo: 'unisci', nazione: id, eserciti: [...] }]` per ogni provincia con almeno due eserciti fermi.
- `rules.js` `routine`: nel giorno degli ordini (`(game.day + hashId(id)) % 7 === 0`), prima di `armyOrders`, `cmds.push(...mergeIdle(game, id))`. Gli eserciti uniti non ricevono ordini doppi: `armyOrders` gira sullo stato del giorno, quindi un esercito già unito nello stesso giorno riceverebbe un ordine su un id che non esiste più → `applyCommand` lo rifiuta senza danni (accettabile), ma per pulizia `armyOrders` salta gli eserciti che compaiono come secondari nei comandi `unisci` della stessa chiamata (`routine` passa l'insieme).
- `renderer.js`: per ogni provincia, gli eserciti si raggruppano per popolo; per ogni popolo si disegnano al più 3 soldatini (i più grandi, più quelli selezionati) e, se ne restano, un'etichetta "+N" accanto all'ultimo. I `markers` restano solo per i soldatini disegnati.
- Test (`rules.test.js`): un popolo con tre eserciti fermi nella stessa provincia riceve un comando `unisci` con tutti e tre nel giorno degli ordini; con un esercito in marcia, quello resta fuori. Test (`armies-view.test.js`): `visibleStack(list, scelti)` → `{ visibili, altri }` con al più 3 per popolo.

### Task 2: Presidio e assedio a giorni contati

- `balance.json`: `assedio.presidioPerUomo: 250`.
- `siege.js`:

```js
export function garrison(game, prov) {
  return Math.round(prov.uomini * game.balance.assedio.presidioPerUomo * (1 + prov.fort));
}

// Punti d'assedio al giorno: 100 × la vecchia probabilità giornaliera, sugli uomini di tutti gli assedianti.
export function siegeRate(game, owner, men, prov) {
  const s = game.balance.assedio, t = game.nazioni[owner].tratti;
  return 100 * Math.min(s.massimo, s.base * men / 1000 / (prov.fort + 1)) * (1 + (t.assedio || 0));
}

export function besiegers(game, prov) // eserciti fermi, non in battaglia, in guerra con il controllore, in prov
export function daysLeft(game, prov)  // null se nessuno assedia; altrimenti ceil((100 - punti) / rate)
```
  `advanceSieges`: per provincia (in ordine di id), gli assedianti; nessun nemico presente; il "padrone dell'assedio" è il popolo con più uomini tra gli assedianti (a pari, il primo in `game.ordine`; i ribelli se ci sono solo ribelli); `p.assedio = { nazione, punti }` (si azzera se cambia la nazione o se non c'è assedio); punti += rate(uomini di tutti gli assedianti dello stesso schieramento del padrone); a ≥ 100 la provincia cade con la regola esistente (ribelli, alleato che libera) e `p.assedio = null`. Province senza assedianti: `p.assedio = null`. `makePeace` azzera `assedio` delle province coinvolte.
- `culture.js` `initCulture`: `p.assedio ??= null`. Salvataggi: validazione `assedio` null o `{ nazione: attiva o ribelli, punti: numero 0..100 }`.
- Test (`siege.test.js`): 5000 uomini contro fort 0 → `daysLeft` = ceil(100 / rate) e la provincia cade esattamente quel giorno; due assedianti sommano gli uomini; arriva un nemico → nessun progresso; gli assedianti se ne vanno → punti a zero; garrison per una provincia con uomini 2 e fort 1 = 1000. I test vecchi che contano su probabilità casuali si adattano (`Ruling:`).

### Task 3: Assalto

- `balance.json`: `assedio.assaltoPerditaVittoria: 0.5`, `assedio.assaltoPerditaSconfitta: 0.2`, `ia.assaltoSoglia: 0.75`.
- `siege.js`: `assaultChance(game, owner, prov)` = uomini / (uomini + presidio × (2 + fort)) con gli uomini degli eserciti fermi di `owner` nella provincia; `checkAssault` (motivi: 'nessun tuo esercito fermo qui', 'non sei in guerra con chi la tiene', 'ci sono nemici nella provincia', 'gli eserciti sono in battaglia'); `assault(game, owner, provId)`: un `nextRandom`; vittoria → la provincia cade (stessa regola), perdite = metà del presidio ripartita sugli eserciti; sconfitta → ogni esercito perde il 20% e morale 0; log `assalto { prov, nazione, vinto }`.
- Comando `{ tipo: 'assalto', nazione, provincia }`.
- `rules.js` `armyOrders`: un esercito che sta assediando e con `assaultChance ≥ ia.assaltoSoglia` → comando `assalto` (una volta per provincia).
- Test: probabilità con numeri della fixture; vittoria e sconfitta forzate con un `game.rng` scelto (cercare due semi con esiti diversi nel test stesso: si prova `rng` da 1 in su finché l'esito è quello voluto, con `structuredClone`); IA all'assalto solo sopra soglia.

### Task 4: Ritirata e ripiego

- `balance.json`: `combattimento.ritirataPerdita: 0.1`.
- `combat.js`: `checkRetreat(game, owner, provId)` (motivo se nessun tuo esercito è in battaglia lì); `orderedRetreat(game, owner, provId)`: per ogni esercito di `owner` in battaglia lì: perde il 10%, morale 0, `retreat(game, a)` (si scioglie se non c'è una provincia sicura); `recordBattle` a favore del nemico; log `ritirata { prov, nazione }`. Comando `{ tipo: 'ritirata', nazione, provincia }`.
- `armies.js`: `nearestSafe(game, owner, from)` (stessa ricerca di `retreat`, senza spostare); comando `{ tipo: 'ripiega', nazione, provincia }`: gli eserciti fermi di `owner` in quella provincia ricevono `orderMove` verso `nearestSafe` (motivo se non c'è).
- Test: ritirata con perdite e morale, battaglia contata persa, scioglimento senza province sicure; ripiego con percorso verso la provincia propria più vicina.

### Task 5: Riquadri delle battaglie in diretta

- `views.js` `battlesView(game, g)`: per ogni provincia con eserciti di `g` in battaglia: `{ prov, nome, miei: { uomini, morale }, nemici: { uomini, morale, popoli: [nomi] }, motivoRitirata, spiegaRitirata }` (morale medio pesato, `spiegaRitirata` dice la perdita del 10% e la provincia di destinazione o "si scioglierebbero: nessuna provincia sicura").
- `main.js`: `ui.battaglie` ricorda, per provincia, il giorno d'inizio e gli uomini del giorno prima (per "caduti oggi"); `#battaglie` (nuovo, in alto sotto la barra) mostra un riquadro per battaglia con giorni, uomini, morale, caduti oggi e il bottone **Ritirata** (`title` con la spiegazione); a fine battaglia il riquadro mostra "Vittoria"/"Sconfitta" per 4 secondi reali e sparisce.
- `panels.js` `battaglieHtml(list)`; CSS dei riquadri.
- Test: `battlesView` con una battaglia della fixture; HTML protetto; ogni bottone con `title`.

### Task 6: Simbolo d'assedio, finestra dell'assedio, riquadro nella provincia

- `views.js` `siegeView(game, g, provId)`: `{ prov, nome, uomini, presidio, fort, giorni, probabilita, motivoAttacco, motivoRipiego, destinazione }` o null se `g` non assedia lì.
- `renderer.js`: dove un tuo esercito assedia, un simbolo di fortezza con i giorni rimasti sopra la provincia; `assedi()` restituisce i punti cliccabili; `main.js` al clic sul simbolo apre la finestra (`H.assedioHtml`), con **Attacca (N%)**, **Assedia (cade tra N giorni)**, **Ritirati**.
- Scheda della provincia: se assedi lì, lo stesso riquadro con i tre bottoni.
- Prova di fumo: un esercito di Roma in una provincia nemica in guerra → simbolo presente, finestra con i tre bottoni, Ritirati manda l'esercito verso casa, Attacca produce un log `assalto`; un esercito in battaglia → riquadro in alto con Ritirata funzionante.

### Task 7: Taratura, README

- `node bench.js 100 20 regole` e `--da 21`: se uno degli obiettivi della sezione 14 esce, si ritocca `assedio.base` o `ia.assaltoSoglia` (un valore alla volta, varianti con `--set`) fino a 6/6 su entrambe; registro con i numeri.
- README: sezioni "Battaglie" e "Assedi".
