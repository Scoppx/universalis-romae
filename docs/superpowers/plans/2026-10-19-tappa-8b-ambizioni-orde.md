# Tappa 8b: ambizioni e orde galliche — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ogni popolo ha un'ambizione storica (sopravvivere fino a un anno, o conquistare una regione) che dà punteggio e guida l'IA; Senoni, Boi e Insubri arrivano come orde senza città che conquistano e poi si stabiliscono.

**Architecture:** Dati nuovi in `public/data/ambizioni.json` (regioni, ambizione per popolo, orde), caricati come `popoli.json` e messi in `game.ambizioni` (non salvati, come `balance`). `sim/ambitions.js` calcola stato e raggiungimento (controllo mensile, bonus in `score`). `sim/hordes.js` crea l'orda (popolo vivo senza province, `n.orda`), la fa stabilire, e le eccezioni (sopravvivenza, mantenimento, pace) stanno nei moduli che le possiedono. L'IA delle orde è `ai/orda.js`, usata da `rulesController`.

**Tech Stack:** Node 24 ES modules, Canvas 2D, `node --test`, playwright-core. Nessuna dipendenza nuova.

**Spec:** `docs/superpowers/specs/2026-10-12-universalis-romae-design.md`, sezione 17 (parti "Ambizioni" e "Orde galliche"); obiettivi della sezione 14.

## Global Constraints

- Simulazione deterministica (numeri casuali solo da `game.rng`, iterazioni in ordine stabile); comandi solo da `applyCommand`; numeri in `balance.json`; ogni bottone con `title`; testi in italiano.
- Salvataggi vecchi validi: campi nuovi assenti → `null` (`n.ambizioneRaggiunta`, `n.orda`); `game.ambizioni` non si salva, al caricamento vale quello corrente (come `balance` e `catalogo` in `public/js/ui/save.js`).
- Il giocatore non entra in guerra senza un clic, salvo un'orda che marcia su una sua provincia (spec 17).
- `balance.json` nuovo blocco: `"ambizioni": { "bonusSopravvivenza": 15, "bonusRegione": 30, "quotaRegione": 0.75, "preferenzaRegione": 1.5, "prudenza": 1.5 }`, `"orde": { "eserciti": 3, "fanteria": 7000, "cavalleria": 1000, "insediamento": 2, "saccheggio": 6 }`.
- Il sito resta statico; l'orda e le ambizioni non usano Jev se non nel contesto delle domande già esistenti.

## Review Focus

1. **Orda distrutta prima di stabilirsi**: il popolo sparisce senza errori nelle viste (capitale mai posseduta), nelle notizie e nel punteggio.
2. **Orda che marcia su una provincia di un alleato del giocatore**: al giocatore arriva la chiamata alle armi (scelta sua), non una guerra automatica.
3. **Salvataggio a metà orda** (eserciti in marcia, guerre aperte, `n.orda` con `prima`) e salvataggi vecchi senza `ambizioneRaggiunta` / `orda`.
4. **Orda che si stabilisce controllando anche province fuori regione**: quelle restano solo controllate e tornano con le regole della pace; quelle della regione diventano sue.
5. **Popoli senza ambizione** (nati da un'indipendenza, `liberi_*`): nessuna riga, nessun bonus, nessun errore.

---

### Task 1: Dati delle ambizioni e delle orde

**Files:**
- Create: `public/data/ambizioni.json`, `tools/gen-regioni.js` (aiuto una tantum, non usato dal gioco)
- Modify: `tools/load-data.js`, `public/js/main.js:28-29` (carica `ambizioni.json`), `public/js/sim/setup.js:25` (`createGame({ …, ambizioni = null })` → `game.ambizioni`), `public/js/ui/save.js` (escludi `ambizioni` dal salvataggio e rimettilo al caricamento come `balance`)
- Test: `test/data.test.js`

**Interfaces:**
- Produces: `game.ambizioni` = `{ regioni: { [rid]: { nome: string, province: string[] } }, popoli: { [id]: { tipo: 'sopravvivere', anno: number } | { tipo: 'regione', regione: string } }, orde: { [id]: { regione: string, ingresso: string } } }`.

Formato e valori fissati qui (il resto delle regioni lo genera `tools/gen-regioni.js`, poi si rivede a mano e si committa):
- `regioni.italia` = tutte le 149 province; `popoli.roma = { tipo: 'regione', regione: 'italia' }`.
- Popoli che partono con **fino a 3 province** e i dormienti: `sopravvivere`, `anno = max(264, storico − 25)` (anni a.C.). Valori storici da usare: veio 396, caere 353, tarquinia 281, vulci 280, volsinii 264, chiusi 295, volterra 298, populonia 280, perugia 295, arezzo 283, falisci 241, volsci 338, equi 304, marsi 304, ernici 306, aurunci 314, cuma 421, peucezi 264, reti 264, elimi 264, reggio 270, sibari 510, crotone 277, taranto 272, locri 275, gela 405, neapolis 326, lucani 264, bruzi 264, senoni 283, boi 264, insubri 264.
- Eccezioni a `regione`: `fenici` → regione `sicilia_occidentale` (Fenici, Elimi, Sicani); `siracusa` → `sicilia` (tutte le province siciliane).
- Popoli da **4 province** in su: `regione` con nome geografico (sanniti "il Sud", lega_latina "il Lazio", sabini "la Sabina", umbri "l'Umbria", piceni "il Piceno", opici "la Campania", enotri "la Lucania", itali "il Bruzio", messapi "il Salento", dauni "la Puglia", veneti "il Veneto", liguri "la Liguria", orobi "la Lombardia", felsina "l'Emilia", siculi "la Sicilia", sicani "la Sicilia occidentale"). `gen-regioni.js`: parte dalle province iniziali del popolo e allarga per vicinanza (in ordine di id) fino a `round(2.5 × n)` province; per i Sanniti almeno Sannio, Campania, Lucania e Apulia.
- `orde`: insubri `{ regione: 'orda_insubri', ingresso: 'comum' }` con regione `mediolanum` + suoi vicini; boi regione `felsina` + vicini, senoni regione `sena_gallica` + vicini; l'`ingresso` di boi e senoni è una provincia confinante con la regione e fuori da essa, a nord (boi) e lungo la costa adriatica (senoni).

- [ ] **Step 1: test RED in `test/data.test.js`** — `'ambizioni: ogni popolo (anche dormiente) ne ha una, valida'`: carica con `loadData()`; per ogni popolo di `popoli.json` esiste `ambizioni.popoli[id]`; ogni id di provincia nelle regioni esiste nella mappa; `sopravvivere.anno` intero tra 264 e 753; ogni regione dei popoli da 4+ province contiene tutte le loro province iniziali e ha tra 2 e 3 volte il loro numero (salvo `italia`, `sicilia`, `sicilia_occidentale`); `ambizioni.popoli.veio` = `{ tipo: 'sopravvivere', anno: 371 }`; `ambizioni.popoli.roma.regione === 'italia'`; per ogni orda `ingresso` non è nella sua regione ed è vicino di una sua provincia.
- [ ] **Step 2:** `node --test test/data.test.js` → FAIL (file mancante).
- [ ] **Step 3:** scrivi `tools/gen-regioni.js`, genera, rivedi, salva `public/data/ambizioni.json`; collega il caricamento (Node e browser) e `createGame`; `save.js` non salva `ambizioni` e lo reinserisce al caricamento.
- [ ] **Step 4:** `node --test test/data.test.js test/save.test.js` → PASS; `npm test` verde.
- [ ] **Step 5:** commit `feat: dati delle ambizioni storiche e delle orde galliche`.

### Task 2: Ambizioni nella simulazione e nel punteggio

**Files:**
- Create: `public/js/sim/ambitions.js`
- Modify: `public/js/sim/loop.js:30` (mensile: `monthlyAmbitions(game)` dopo `monthlyEvents`), `public/js/sim/score.js` (bonus), `public/js/sim/setup.js` e `public/js/sim/dormant.js` (`n.ambizioneRaggiunta = null`), `public/js/ui/save.js` (validazione: `null` o intero ≥ 0; migrazione assente → `null`), `public/data/balance.json` (blocco `ambizioni`)
- Test: `test/ambitions.test.js` (nuovo), `test/save.test.js`

**Interfaces:**
- Produces:
  - `ambitionOf(game, id) → { tipo: 'sopravvivere', anno } | { tipo: 'regione', regione, nome, province: string[] } | null`
  - `ambitionStatus(game, id) → null | { tipo, raggiunta: boolean, giaRaggiunta: boolean, anniMancanti?: number, quota?: number, possedute?: number, totale?: number }` (quota = tasse possedute nella regione / tasse della regione)
  - `monthlyAmbitions(game)`: per ogni popolo vivo senza `ambizioneRaggiunta`: `sopravvivere` raggiunta quando `dateFromDay(game.day).year ≤ anno`; `regione` quando quota ≥ `balance.ambizioni.quotaRegione` e possiede ancora la capitale. Allora `n.ambizioneRaggiunta = game.day` e `log({ tipo: 'ambizione', nazione: id })`.
  - `score(game, id)` aggiunge `bonusSopravvivenza` o `bonusRegione` se `ambizioneRaggiunta !== null` (il bonus resta anche perdendo le terre).

- [ ] **Step 1: test RED** in `test/ambitions.test.js` (fixture `makeGame()` con `g.ambizioni` scritto nel test):
  - `'sopravvivere: raggiunta all\'anno, una volta sola, bonus nel punteggio'` — popolo con `anno` = anno corrente − 1: niente; si porta `g.day` a quell'anno, `monthlyAmbitions` → `ambizioneRaggiunta === g.day`, un log `ambizione`; `score` cresce di 15; un secondo `monthlyAmbitions` non logga di nuovo.
  - `'regione: 75% delle tasse e la capitale'` — sotto quota niente; sopra quota senza capitale niente; con capitale raggiunta; perse le province dopo, il bonus resta.
  - `'popolo senza ambizione: nessun errore'` — `ambitionOf` e `ambitionStatus` → `null`, `score` invariato.
  - in `test/save.test.js`: un salvataggio senza `ambizioneRaggiunta` si carica con `null`; con `'x'` è rifiutato.
- [ ] **Step 2:** `node --test test/ambitions.test.js test/save.test.js` → FAIL.
- [ ] **Step 3:** implementa le firme sopra.
- [ ] **Step 4:** stessi test → PASS; `npm test` verde.
- [ ] **Step 5:** commit `feat: ambizioni storiche raggiunte con bonus di punteggio`.

### Task 3: L'IA segue l'ambizione

**Files:**
- Modify: `public/js/ai/rules.js` (`warDecision`, `ultimatumDecision`), `public/js/ai/questions.js` (`statoPopolo`)
- Test: `test/rules.test.js`, `test/questions.test.js`

**Interfaces:**
- Consumes: `ambitionOf(game, id)` (Task 2).
- Produces: `ambitionTargets(game, id) → string[]` in `rules.js`: i popoli che possiedono province della regione dell'ambizione (vuoto per `sopravvivere`).

Regole: in `warDecision` i candidati di `legalWarTargets` si ordinano per `rapporto × (bersaglio in ambitionTargets ? preferenzaRegione : 1)`, ma la soglia `rapportoGuerra` si confronta con il rapporto vero; un popolo con ambizione `sopravvivere` vuole `rapportoGuerra × prudenza`. In `statoPopolo` si aggiunge `ambizione`: testo come "sopravvivere fino al 371 a.C." o "conquistare il Sud (34% delle tasse)".

- [ ] **Step 1: test RED** — `'ambizione: a parità quasi pari di forze si attacca chi sta nella regione'` (due candidati, quello fuori regione con rapporto un po' più alto: si sceglie quello in regione); `'ambizione: chi deve sopravvivere è più prudente'` (rapporto 2,5 con `rapportoGuerra` 2 e `prudenza` 1,5 → nessuna guerra; 3,1 → guerra); `'Jev vede l\'ambizione'` (lo stato della domanda di revisione contiene `ambizione`).
- [ ] **Step 2:** `node --test test/rules.test.js test/questions.test.js` → FAIL.
- [ ] **Step 3:** implementa.
- [ ] **Step 4:** PASS; `npm test` verde.
- [ ] **Step 5:** commit `feat: l'IA e Jev seguono l'ambizione del popolo`.

### Task 4: Ambizioni nell'interfaccia

**Files:**
- Modify: `public/js/ui/views.js` (`ambitionView`, `formatLogEntry` caso `ambizione`, `importantNews`), `public/js/ui/panels.js` (riga in `governoHtml`, scheda iniziale), `public/js/main.js` (scheda della schermata iniziale `#inizio-scheda`)
- Test: `test/views.test.js`, `test/panels.test.js`, `tools/smoke.mjs`

**Interfaces:**
- Consumes: `ambitionOf`, `ambitionStatus` (Task 2).
- Produces: `ambitionView(game, id) → null | { testo: string, stato: string, raggiunta: boolean }` — es. testo "Sopravvivi fino al 371 a.C.", stato "mancano 40 anni" / "raggiunta (+15 punti)"; testo "Conquista il Sud", stato "4 province su 11, 34% delle tasse".

- [ ] **Step 1: test RED** — `ambitionView` nei due tipi e `null` per un popolo senza ambizione; `formatLogEntry({ tipo: 'ambizione', nazione: 'roma' })` → testo con "ambizione"; `importantNews` la include solo per il giocatore; `governoHtml` mostra la riga "Ambizione" protetta con `esc`; prova di fumo: la scheda iniziale di Roma contiene "Conquista l'Italia".
- [ ] **Step 2:** test → FAIL.
- [ ] **Step 3:** implementa.
- [ ] **Step 4:** `npm test` e `npm run smoke` verdi.
- [ ] **Step 5:** commit `feat: l'ambizione si vede all'inizio, nel Governo e nelle notizie`.

### Task 5: Le orde nella simulazione

**Files:**
- Create: `public/js/sim/hordes.js`
- Modify: `public/js/sim/war.js` (`checkSurvival`: un'orda vive senza province finché ha eserciti; `proposePeace`/`checkProposal` di pace: motivo `"un'orda non tratta"` se uno dei capofila è un'orda), `public/js/sim/economy.js` (`monthlyUpkeep` 0 per un'orda), `public/js/sim/siege.js` (`fallProvince`: se `capo` è un'orda, saccheggio e `orda.prima` alla prima provincia presa nella regione), `public/js/sim/events.js` + `public/js/sim/validate-events.js` (effetto `orda: { popolo }`), `public/data/eventi/dormienti.json` (le tre invasioni usano `orda` invece di `crea_popolo`), `public/js/ui/save.js` (validazione `n.orda`), `public/data/balance.json` (blocco `orde`)
- Test: `test/hordes.test.js` (nuovo), `test/events-data.test.js`, `test/save.test.js`

**Interfaces:**
- Consumes: `game.ambizioni.orde`, `game.ambizioni.regioni` (Task 1).
- Produces:
  - `activateHorde(game, popolo) → string | null`: crea `game.nazioni[popolo]` dal dormiente (come `activateDormant`, ma nessuna provincia: `capitale` = capitale del dormiente, `tesoro` 0, `uomini` 0, `orda = { regione, prima: null }`, `ambizioneRaggiunta: null`), aggiunge a `ordine`, `initDiplomacy`/`initGovernment`, crea `orde.eserciti` eserciti da `orde.fanteria`/`orde.cavalleria` in `ingresso`, log `{ tipo: 'orda', nazione, prov: ingresso }`; `null` se il popolo non è più dormiente.
  - `isHorde(game, id) → boolean`.
  - `checkSettle(game, id)`: se le province della regione con `controller === id` sono almeno `orde.insediamento`: diventano sue (`owner = id`, assimilazione da zero), `capitale = orda.prima`, `orda = null`, log `{ tipo: 'insediamento', nazione, prov: capitale }`. Chiamata da `fallProvince` dopo una presa dell'orda.
  - saccheggio: `tesoro += prov.tasse × economia.tasseMese × orde.saccheggio`.

- [ ] **Step 1: test RED** in `test/hordes.test.js` (fixture con `g.ambizioni.orde` e un dormiente scritti nel test):
  - `'orda: nasce senza province, con i suoi eserciti all\'ingresso, e non muore per questo'` — dopo `activateHorde` e `checkSurvival` è viva; 3 eserciti da 7000+1000; nessun mantenimento.
  - `'orda: senza eserciti sparisce'`.
  - `'orda: niente pace finché è un\'orda'` — `proposePeace` → `{ ok: false, motivo: "un'orda non tratta" }`.
  - `'orda: saccheggia e si stabilisce dopo due province della regione'` — una presa fuori regione: resta orda; due prese in regione: `owner` passa all'orda, `capitale` = la prima presa in regione, log `insediamento`; una provincia presa fuori regione resta solo controllata.
  - `'evento d\'invasione: crea l\'orda'` (catalogo vero: l'effetto `orda` di `invasione_insubri` passa il validatore e crea l'orda).
  - in `test/save.test.js`: `n.orda` valido salvato e ricaricato; malformato rifiutato; assente → `null`.
- [ ] **Step 2:** `node --test test/hordes.test.js test/events-data.test.js test/save.test.js` → FAIL.
- [ ] **Step 3:** implementa.
- [ ] **Step 4:** PASS; `npm test` verde; `npm run validate-events` ok.
- [ ] **Step 5:** commit `feat: orde galliche senza città che saccheggiano e si stabiliscono`.

### Task 6: L'IA delle orde

**Files:**
- Create: `public/js/ai/orda.js`
- Modify: `public/js/sim/war.js` (`hasPretext`: vero se l'attaccante è un'orda), `public/js/ai/rules.js` (`rulesController`: se `isHorde` → solo `hordeOrders` più le risposte a proposte ed eventi), `public/js/ai/modes.js` (`syncControllers`/`buildControllers`: un'orda ha sempre `rulesController`, anche in modalità Jev)
- Test: `test/hordes.test.js`

**Interfaces:**
- Consumes: `isHorde`, `game.ambizioni` (Task 5).
- Produces: `hordeOrders(game, id) → command[]`, nel giorno degli ordini (come `armyOrders`): bersaglio = la provincia della regione non controllata dall'orda più vicina all'esercito (percorso su `vicini` senza vincoli d'accesso, a pari distanza id minore); passo successivo del percorso: se il padrone non è in guerra con l'orda e non ne è amico → `{ tipo: 'dichiara_guerra', nazione: id, contro: padrone }` (passa da `applyCommand` → `declareWar`; l'orda non perde stabilità perché `hasPretext(game, a, b)` in `war.js` è vero quando `a` è un'orda — modifica di questo task); poi `{ tipo: 'muovi', … }` verso il passo; gli eserciti dell'orda fermi nella stessa provincia si uniscono (`mergeIdle`); un esercito che assedia con `assaultChance ≥ ia.assaltoSoglia` assalta.

- [ ] **Step 1: test RED** — `'orda IA: dichiara guerra solo al padrone della prossima provincia e marcia'` (fixture: ingresso, una provincia di passaggio di un terzo, regione di un quarto: il primo giorno degli ordini guerra al terzo, non al quarto; ordine di marcia); `'orda IA: con Jev resta a regole'`; `'orda IA: su una provincia di un alleato del giocatore, il giocatore riceve una chiamata, non una guerra'`; `'orda IA: arriva, assedia e si stabilisce in una partita headless'` (dati veri, seme fisso, `activateHorde(game, 'insubri')` al giorno di un anno nel 400 a.C., 10 anni di `advanceDay` → `game.nazioni.insubri.orda === null` e possiede almeno 2 province).
- [ ] **Step 2:** `node --test test/hordes.test.js` → FAIL.
- [ ] **Step 3:** implementa.
- [ ] **Step 4:** PASS; `npm test` verde.
- [ ] **Step 5:** commit `feat: le orde marciano verso la loro regione dichiarando guerra a chi incontrano`.

### Task 7: Interfaccia delle orde, bench, taratura, README

**Files:**
- Modify: `public/js/ui/views.js` (`formatLogEntry` casi `orda` e `insediamento`; `importantNews`: `orda` se la sua regione o l'ingresso toccano province del giocatore, `insediamento` se tocca il giocatore; scheda Guerre: pace spenta con `title` "un'orda non tratta"), `public/js/ui/renderer.js` se serve (il popolo senza province non ha etichetta), `bench.js` (riepilogo: quota di ambizioni raggiunte per tipo, orde nate e insediate), `README.md` (sezioni "Ambizioni" e "Orde galliche")
- Test: `test/views.test.js`, `test/panels.test.js`, `test/bench.test.js`

- [ ] **Step 1: test RED** — notizie dell'orda e dell'insediamento; bottone di pace spento con `title` contro un'orda; `runBench({ anni: 5, semi: 1 })` → `riepilogo.ambizioni` con `{ sopravvivere, regione }` tra 0 e 1 e `riepilogo.orde` con `{ nate, insediate }`.
- [ ] **Step 2:** test → FAIL. **Step 3:** implementa. **Step 4:** `npm test`, `npm run smoke` verdi.
- [ ] **Step 5: taratura** — `node bench.js 489 10 regole` (in 5 processi `--da 1,3,5,7,9` con 2 semi; in zsh espandere le opzioni con `${=S}`) e i due bench `100 20 regole` / `--da 21`. Obiettivi: le orde nate si stabiliscono in almeno 2 casi su 3; ambizioni `regione` raggiunte da qualche popolo dell'IA ma non dalla maggioranza (indicativo 10–40%), `sopravvivere` tra 20 e 70%; sezione 14 entro la tolleranza della tappa 8a (normale ≤ 71%, difficile ≤ 52%, il resto ✓). Leve, una alla volta: `orde.fanteria`, `orde.insediamento`, `ambizioni.preferenzaRegione`, `ambizioni.prudenza`; registro con i numeri.
- [ ] **Step 6:** README; commit `feat: orde e ambizioni visibili, bench e taratura`.

### Task 8: Revisione, unione, pubblicazione

- [ ] Revisione finale dell'intero ramo (pacchetto `review-package`, revisore sul modello più capace, Review Focus qui sopra), correzioni Critical/Important con test RED→GREEN, unione in `main`, `git push` (Actions pubblica), memoria aggiornata.
