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
- Salvataggio automatico ogni anno (Continua nella schermata iniziale); **Esporta/Importa** per i file.

## Struttura

- `public/js/sim/` — simulazione pura (nessun DOM, caso solo da `rng.js`)
- `public/js/ai/` — IA a regole (poi Jev)
- `public/data/` — mappa, popoli, bilanciamento
- `data/` — sorgenti della mappa
- `tools/` — generazione mappa e caricamento dati
