# Universalis Romae

Clone di Europa Universalis II ambientato nell'Italia antica (753–264 a.C.).
I popoli non giocati decidono con Jev (TypeSafe) o con un'IA a regole.

Design: `docs/superpowers/specs/2026-10-12-universalis-romae-design.md`

## Comandi

- `npm start` — avvia il gioco su http://localhost:5178
- `npm run smoke` — prova di fumo in Chromium headless (serve il Chromium di Playwright in cache, oppure `CHROME_PATH`)
- `npm install` — dipendenze di sviluppo (solo per la mappa)
- `npm test` — tutti i test
- `npm run fetch-ne` — scarica Natural Earth in `data/ne/` (una volta)
- `npm run build-map` — rigenera `public/data/map.json` da `data/centri.json`
- `npm run build-relief` — rigenera `public/img/rilievo.jpg` dai dati di elevazione (scarica i tasselli in `data/dem/`)
- `node bench.js [anni] [semi]` — partite headless con l'IA a regole, tabella in `bench-regole.txt`

## Come si gioca

- Scegli un popolo (lista o clic sulla mappa), poi **Inizia**.
- **Barra spaziatrice**: pausa. **1–5** o **+/−**: velocità.
- **Clic** su una provincia: scheda a destra. **Rotella**: zoom. **Trascina**: sposta la mappa.
- **Eserciti**: clic sul soldatino per selezionarlo; **Maiuscolo+clic** o **Maiuscolo+trascina** per sceglierne più d'uno; **clic destro** sulla destinazione. Nella scheda Eserciti: **Unisci** e **Dividi**.
- **Diplomazia**: dichiara guerra ai vicini. **Guerre**: chiedi le province occupate, cedi le tue o proponi la pace bianca.
- **Diplomazia**: per ogni popolo vedi la relazione e cosa puoi fare (il motivo, se un bottone è spento): ambasceria, alleanza, foedus, tributo, ultimatum, guerra. Quando dichiari guerra i tuoi alleati vengono chiamati alle armi; quelli del nemico entrano da soli. Da un foedus si può uscire, ma costa stabilità e dà al protettore un pretesto di guerra.
- **Governo**: ogni governo ha i suoi effetti (tribù: +20% reclute, −20% tasse; monarchia: la stabilità tende a +1; repubblica: +10% tasse, riforme ogni 15 anni; lega: foedus già con forza doppia; città-stato: +20% tasse, −20% reclute). Tre **riforme** da −5 a +5, una mossa ogni 10 anni: società (patrizi +2% tasse per punto, plebe +3% reclute), dottrina (oltre ±4, +1 al dado in difesa o in attacco), province (accentramento: assimilazione più veloce ma più malcontento; autonomia: il contrario).
- **Stabilità in battaglia**: con stabilità +2 o più +1 al dado, con −2 o meno −1. Una guerra senza pretesto costa 2 di stabilità: chi attacca così combatte peggio finché la stabilità non risale.
- **Province**: il malcontento (0–10) sale con la cultura diversa, la stabilità negativa e l'accentramento. Le province straniere si assimilano in circa 15 anni; una **colonia** (denaro e 1000 uomini) raddoppia l'assimilazione e toglie 1 di malcontento. Le **fortificazioni** salgono fino al livello 3. Mappa **Malcontento** per vedere dove c'è rischio.
- **Rivolte**: oltre 3 di malcontento ogni mese può nascere un esercito ribelle, in guerra con tutti, che assedia la provincia. Se la tiene un anno la provincia diventa indipendente: va al vicino della stessa cultura o nasce un popolo nuovo.
- **Eventi**: carestie, oracoli, ambascerie, cambi di governo (cacciata del re, tirannide, dittatore) ed eventi storici (ratto delle Sabine, XII tavole, sacco gallico). Quando ne arriva uno il gioco si ferma e una finestra mostra le opzioni con i loro effetti. Gli altri popoli scelgono con le regole o con Jev.
- **Popoli dormienti**: le colonie greche (Siracusa, Taranto, Neapolis…) sbarcano vicino alla data storica: chi possiede la provincia sceglie se accoglierle (cede la provincia, ne ha un vicino amico e denaro) o respingerle (nascono armate e in guerra). Lucani, Bruzi e Galli arrivano senza chiedere, con un'invasione.
- Salvataggio automatico ogni anno (Continua nella schermata iniziale); **Esporta/Importa** per i file.

## Difficoltà e taratura

Ogni popolo ha un'etichetta di difficoltà con un bonus in `balance.json` (`difficolta`): moltiplicatori dell'esercito, del tesoro e della riserva iniziali (`esercito`, `tesoro`, `uomini`), un modificatore al dado (`dado`), bonus di reclute e tasse per tutta la partita (`reclute`, `tasse`) e, per i facili, la capitale che non si cede né in pace né con un ultimatum (`capitaleSalva`). "Molto difficile" resta senza aiuti: Volsci ed Equi sono duri anche da giocare.

Altre regole contro una guerra troppo letale, tutte in `balance.json`:
- `guerra.quotaPace`: una pace prende al più questa quota delle province di un popolo (almeno una);
- `guerra.tregua`: giorni di tregua dopo una pace;
- `ia.anniDiRespiro`: anni iniziali senza guerre dell'IA;
- `ia.paceBiancaAnni`, `ia.stanchezzaAnni`: quando l'IA propone e accetta la pace bianca;
- `ia.rapportoGuerra`: vantaggio di forze che l'IA vuole prima di attaccare;
- `infamia.perProvincia`: infamia per ogni provincia presa (oltre la soglia l'IA non attacca);
- `nuoviPopoli`: tregua ed esercito dei popoli nati da un'indipendenza o da un risveglio.

Alla pace ogni provincia va a chi la occupa (il vincitore o un suo alleato).

Il bench controlla gli obiettivi: `node bench.js 100 20 regole` stampa, sotto la tabella, la sopravvivenza per difficoltà (facile ≥ 80% e Roma che cresce, normale 50–65%, difficile 30–45%, molto difficile al più 30%, totale ≥ 55%) con ✓/✗, le guerre per popolo-anno e i popoli nuovi. Per provare una variante senza toccare il file: `--set ia.rapportoGuerra=2` (ripetibile); `--da 21` fa partire i semi da 21.

## Eventi

Il catalogo sta in `public/data/eventi/` (`generici`, `governo`, `storici`, `dormienti`). `npm run validate-events` lo controlla; il gioco non parte se non è valido. Ogni evento ha `id`, `titolo`, `testo`, `condizioni` (`probabilita` mensile, `anni` a.C. `[da, a]`, `unaVolta` `partita`/`popolo`/`false`, `popoli`, `culture`, `governi`, `provincia`, `minProvince`, `maxProvince`, `stabilitaMin`, `stabilitaMax`, `guerra`, `altro` con `preferiti`, `culture`, `soloPreferiti`), `opzioni` (da 1 a 4, ciascuna con `id`, `testo` ed `effetti`), la `regola` scelta dall'IA a regole e, se serve, `storico: true` (compare nelle notizie di tutti).

Effetti: `stabilita`, `tesoroMesi` (mesi di entrate), `uominiQuota` (quota della riserva massima), `infamia`, `relazione`, `pretesto`, `pretestoAltro`, `guerra` (questi quattro sull'"altro"), `cambia_governo`, `slider` (es. `{ "societa": 1 }`), `crea_popolo` (`{ "popolo", "esercito", "guerra", "relazione" }`, solo per i dormienti).

## Struttura

- `public/js/sim/` — simulazione pura (nessun DOM, caso solo da `rng.js`)
- `public/js/ai/` — IA a regole (poi Jev)
- `public/data/` — mappa, popoli, bilanciamento
- `data/` — sorgenti della mappa
- `tools/` — generazione mappa e caricamento dati
