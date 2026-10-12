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
- `node bench.js [anni] [semi]` — partite headless con l'IA a regole, tabella in `bench-regole.txt`

## Come si gioca

- Scegli un popolo (lista o clic sulla mappa), poi **Inizia**.
- **Barra spaziatrice**: pausa. **1–5** o **+/−**: velocità.
- **Clic** su una provincia: scheda a destra. **Rotella**: zoom. **Trascina**: sposta la mappa.
- **Eserciti**: seleziona (clic sull'etichetta o dalla scheda Eserciti), poi **clic destro** sulla destinazione.
- **Diplomazia**: dichiara guerra ai vicini. **Guerre**: chiedi le province occupate, cedi le tue o proponi la pace bianca.
- Salvataggio automatico ogni anno (Continua nella schermata iniziale); **Esporta/Importa** per i file.

## Struttura

- `public/js/sim/` — simulazione pura (nessun DOM, caso solo da `rng.js`)
- `public/js/ai/` — IA a regole (poi Jev)
- `public/data/` — mappa, popoli, bilanciamento
- `data/` — sorgenti della mappa
- `tools/` — generazione mappa e caricamento dati
