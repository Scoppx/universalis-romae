# Tappa 8a: la sfida — piano di implementazione

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Conquistare l'Italia con Roma deve richiedere gran parte della partita: ultimatum e annessioni più cari, coalizioni che attaccano davvero, sovraestensione, foedus integrabile o liberabile, livello di sfida per il giocatore; un giocatore automatico aggressivo misura il risultato.

**Architecture:** Leve nuove in `balance.json` (`ultimatum`, `annessione`, `coalizione`, `sovraestensione`, `foedus`, `sfida`); la coalizione è un controllo mensile in `sim/diplomacy.js` che usa `startWar` e aggiunge i membri allo schieramento; la sovraestensione entra in `malcontent`; il livello di sfida sta in `game.sfida` e `game.giocatore` (scritti dalla sessione) e si somma ai bonus in `difficultyOf` per i popoli dell'IA; il giocatore automatico è un controller in `ai/conquistatore.js` usato da `bench.js` con la modalità `conquistatore`.

**Tech Stack:** Node 24 ES modules, `node --test`, playwright-core.

**Spec:** `docs/superpowers/specs/2026-10-12-universalis-romae-design.md`, sezione 16 (obiettivi della sezione 14 da mantenere).

## Global Constraints

- Simulazione deterministica; comandi solo da `applyCommand`; ogni bottone con `title`.
- Valori iniziali in `balance.json`: `ultimatum: { anniAttesa: 10, infamia: 1.5, relazioneBersaglio: -50, relazioneVicini: -10 }`, `annessione: { infamia: 2 }`, `coalizione: { rapporto: 1.2, anniAttesa: 10 }`, `sovraestensione: { soglia: 15, perProvincia: 0.15, massimo: 3 }`, `foedus: { anniIntegrazione: 10, relazioneIntegrazione: 100, costoPerTassa: 10, infamia: 0.5, relazioneLiberazione: 25 }`, `sfida: { normale: {}, difficile: { tasse: 0.2, reclute: 0.2 }, storico: { tasse: 0.4, reclute: 0.4, sogliaCoalizione: 15 } }`.
- Obiettivo nuovo: con il giocatore automatico su Roma a sfida normale, 75% delle tasse d'Italia non prima di 350 anni (su 10 semi: mediana). Obiettivi della sezione 14 invariati.

## Review Focus

1. **Coalizione contro il giocatore** mentre è già in guerra con alcuni membri: niente doppie guerre, niente membri in tregua con lui o suoi amici.
2. **Ultimatum a un popolo con alleati più forti** e a un federato (conta il protettore).
3. **Integrazione** di un federato in guerra o con un proprio federato; **liberazione** in guerra.
4. **Salvataggi** vecchi senza `foedusDal`, `ultimatumAccettati`, `coalizioneDal`, `sfida`.
5. **Livello di sfida** che non deve toccare il bench né il giocatore stesso.

---

### Task 1: Ultimatum e annessione più cari
- `diplomacy.js`: la risposta delle regole all'ultimatum (`rules.js answerProposals`) usa `power(da) ≥ ultimatumRapporto × forzaDifesa(bersaglio)`, dove `forzaDifesa` somma il bersaglio, i suoi alleati, i suoi federati e il protettore; `checkProposal` ultimatum rifiuta se `ultimatumAccettati[to] + 10 anni > oggi` ("hai già ottenuto una provincia da lui: riprova tra N anni"); all'accettazione: infamia × 1,5, relazione −50 con il bersaglio e −10 con i suoi confinanti, `A.ultimatumAccettati[to] = day`.
- `war.js makePeace`: con `termini.annessione` l'infamia di ogni provincia × `annessione.infamia`.
- `views`: il `title` di Annetti e il costo mostrato tengono conto del moltiplicatore; la scheda Diplomazia spiega l'attesa dell'ultimatum.
- Test (RED prima): ultimatum rifiutato dalle regole se gli alleati del bersaglio pareggiano; cooldown di 10 anni; infamia e relazioni dopo l'accettazione; infamia doppia dell'annessione; salvataggi con `ultimatumAccettati`.

### Task 2: Coalizioni vere
- `diplomacy.js monthlyCoalitions(game)` (dal ciclo mensile), in due fasi:
  - **formazione**: per ogni popolo vivo X con infamia oltre la soglia (per il giocatore a sfida storico: `sfida.storico.sogliaCoalizione`) e senza coalizione in corso né negli ultimi 10 anni: membri = confinanti ostili (relazione < 0), vivi, non amici di X, non federati, **con infamia propria sotto la soglia**, non in tregua con X; se la loro forza ≥ 1,2 × `forzaDifesa(X)` → `game.coalizioni[X] = { membri, dal: day }`, log `coalizione_formata`.
  - **dopo 365 giorni**: si ricalcolano i membri ancora validi; se X ha ancora l'infamia oltre la soglia e la forza basta → il più forte dichiara guerra con `startWar`, gli altri si aggiungono agli attaccanti (relazioni −100), log `coalizione_guerra`, `X.coalizioneDal = day`; altrimenti log `coalizione_sciolta`; in entrambi i casi `delete game.coalizioni[X]`.
- `views`: notizie per tutti; nella Diplomazia del bersaglio un riquadro "Coalizione contro di te: … attacca il … se la tua infamia resta sopra 20".
- Test: formazione e guerra dopo un anno; scioglimento se l'infamia scende; membri con infamia alta esclusi; niente guerra contro chi è già in guerra con un membro (quel membro esce); salvataggi con `coalizioni`.

### Task 3: Sovraestensione
- `culture.js malcontent`: se il padrone ha più di `soglia` province, le province di cultura diversa ricevono `min(massimo, (n − soglia) × perProvincia)`.
- `views`: nella scheda Governo una riga "Sovraestensione: N province oltre 15 (+M malcontento)" e la riga Malcontento della provincia lo include (già calcolato).
- Test: malcontento con 14, 16 e 40 province.

### Task 4: Foedus — integrare e liberare
- `diplomacy.js`: all'accettazione del foedus `B.foedusDal = day`; `checkIntegrate(game, P, F)` (motivi: non è tuo federato; foedus da meno di 10 anni — "ancora N anni"; relazione sotto 100; in guerra; denari insufficienti); `integrate(game, P, F)`: paga, tutte le province di F passano a P (infamia × 0,5 per provincia), F eliminato; `checkRelease` / `release(game, P, F)`: `F.protettore = null`, relazione +25. Comandi `integra`, `libera`.
- `views.diplomacyView`: azioni `integra` e `libera` per i federati, con costo; `panels`: bottoni con `title`.
- Test: tutti i motivi, integrazione completa, liberazione; salvataggi con `foedusDal` (vecchi: assente = molto tempo fa).

### Task 5: Livello di sfida
- Schermata iniziale: menu "Sfida" (normale, difficile, storico) con `title` che spiega; la sessione salva `game.sfida` e `game.giocatore`; `difficultyOf` aggiunge `tasse` e `reclute` di `balance.sfida[game.sfida]` ai popoli che non sono `game.giocatore` (se `game.giocatore` è null, nessun effetto); salvataggi: `sfida` e `giocatore` validati e migrati (`normale`).
- Test: bonus solo all'IA, niente nel bench, soglia della coalizione a storico.

### Task 6: Giocatore automatico aggressivo e taratura
- `ai/conquistatore.js`: `conquerorController` = regole con: guerra al vicino più debole da rapporto 1,2 (ignora il respiro iniziale? no: lo rispetta), in guerra chiede sempre tutte le province possibili e propone l'annessione appena `annexable`; fuori guerra manda un ultimatum ogni volta che `checkProposal` lo permette, verso la provincia più ricca; recluta al massimo.
- `bench.js` modalità `conquistatore`: Roma con questo controller, gli altri a regole; riepilogo "Italia al 75%: anno N (mediana dei semi), in X semi su Y".
- Taratura: `node bench.js 489 10 conquistatore` (partita intera) e i due bench da 20 semi; si ritoccano le leve di questa tappa (un valore alla volta) finché la mediana è ≥ 350 anni (o mai) e la sezione 14 regge.

### Task 7: README, revisione, unione, pubblicazione
