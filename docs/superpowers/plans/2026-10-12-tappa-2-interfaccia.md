# Universalis Romae — Tappa 2: interfaccia giocabile — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendere il gioco giocabile nel browser: si sceglie un popolo, la mappa scorre in tempo reale con pausa, si reclutano e muovono eserciti, si dichiarano guerre, si fa la pace, si salva e si carica.

**Architecture:** Un server Node senza dipendenze serve `public/`. La logica dell'interfaccia che si può testare senza browser (camera, selezione, orologio, sessione, salvataggi, modelli dei pannelli, colori) sta in moduli puri sotto `public/js/ui/` con test `node --test`. Le parti DOM (`renderer.js`, `input.js`, `panels.js`, `main.js`) sono verificate da una prova di fumo in Chromium headless (`npm run smoke`, playwright-core con il Chromium già in cache). Tutte le azioni del giocatore passano da `applyCommand` della tappa 1.

**Tech Stack:** Node 24, moduli ES, Canvas 2D, `node --test`; `playwright-core@1.63.0` solo in sviluppo per la prova di fumo.

**Spec:** `docs/superpowers/specs/2026-10-12-universalis-romae-design.md` (sezione 6, Interfaccia).

**Esecuzione:** tutto *inline*: i compiti sono legati fra loro attraverso `main.js`, quindi i subagenti non porterebbero vantaggi.

## Global Constraints

- Nessuna dipendenza a runtime: il browser carica solo file di `public/`.
- `public/js/sim/` resta invariato, salvo il campo `parti` nel log della pace (task 3).
- Il giocatore comanda solo attraverso `applyCommand(game, { ...cmd, nazione: giocatore })`.
- Ogni accesso a `localStorage` passa da `readStorage` / `writeStorage` (try/catch): senza storage il gioco funziona, solo senza salvataggio automatico.
- Server solo su loopback `127.0.0.1`, porta predefinita 5178.
- Testi dell'interfaccia in italiano; solo desktop (mouse e clic destro).
- Velocità 1–5 = 1000, 500, 200, 100, 50 ms per giorno; al massimo 10 giorni per fotogramma.
- Salvataggio automatico ogni anno di gioco, chiave `universalis-romae:autosave`; il bilanciamento non entra nel file salvato (al caricamento si usa quello corrente).
- Commit alla fine di ogni task con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Il pannello si ridisegna mentre il gioco scorre e il giocatore sta spuntando province o scrivendo numeri: le scelte non si perdono (prova di fumo nel task 7).
2. Importazione di un file rovinato, di un'altra versione o di un'altra mappa: rifiutata con messaggio, la partita in corso continua (test nel task 5, prova di fumo nel task 8).
3. L'esercito selezionato viene distrutto o si unisce a un altro: niente errori, la selezione si azzera (prova di fumo nel task 7).
4. Scheda del browser inattiva a lungo e poi riaperta: al massimo 10 giorni per fotogramma, niente blocchi (test nel task 4).
5. `localStorage` non disponibile (navigazione privata): il gioco parte e si gioca, niente eccezioni (test nel task 5).

## Mappa dei file

```
server.js                       file statici da public/ (proxy Jev nella tappa 3)
tools/smoke.mjs                 prova di fumo in Chromium headless
public/index.html
public/css/style.css
public/js/main.js               regia: avvio, ciclo, schermata iniziale, comandi del giocatore
public/js/ui/geom.js            punto nel poligono, riquadri (condiviso con tools/geo.js)
public/js/ui/camera.js          trasformazione mappa ↔ schermo, zoom, spostamento
public/js/ui/hit.js             provincia o esercito sotto il mouse
public/js/ui/colors.js          colori per modalità della mappa
public/js/ui/views.js           modelli dei pannelli (dati pronti da mostrare)
public/js/ui/clock.js           tempo reale → giorni di gioco
public/js/ui/session.js         partita del giocatore: controller, avanzamento, pause
public/js/ui/save.js            salvataggi: serializza, valida, storage sicuro
public/js/ui/renderer.js        disegno su Canvas
public/js/ui/input.js           mouse e tastiera
public/js/ui/panels.js          HTML dei pannelli
test/server.test.js, test/geom-camera.test.js, test/views.test.js, test/clock-session.test.js, test/save.test.js
```

---

### Task 1: Server statico — *inline*

**Files:**
- Create: `server.js`
- Modify: `package.json` (script `start`)
- Test: `test/server.test.js`

**Interfaces:**
- Produces: `createServer(root) → http.Server` (solo GET; 403 fuori da `root`, 404 se manca, 405 per altri metodi); `startServer(port = PORT || 5178) → Promise<http.Server>` in ascolto su 127.0.0.1. Eseguito direttamente (`npm start`) stampa l'indirizzo.

- [ ] **Step 1: Scrivi il test che fallisce `test/server.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../server.js';

function setup() {
  const base = mkdtempSync(path.join(tmpdir(), 'ur-'));
  const root = path.join(base, 'public');
  mkdirSync(path.join(root, 'data'), { recursive: true });
  writeFileSync(path.join(root, 'index.html'), 'ciao');
  writeFileSync(path.join(root, 'data', 'x.json'), '{"a":1}');
  writeFileSync(path.join(base, 'segreto.txt'), 'no');
  const server = createServer(root);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () =>
    resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

test('serve index e json con il tipo giusto', async () => {
  const { server, url } = await setup();
  const r1 = await fetch(`${url}/`);
  assert.equal(r1.status, 200);
  assert.match(r1.headers.get('content-type'), /text\/html/);
  assert.equal(await r1.text(), 'ciao');
  const r2 = await fetch(`${url}/data/x.json`);
  assert.match(r2.headers.get('content-type'), /application\/json/);
  server.close();
});

test('niente file fuori dalla cartella, 404 e 405', async () => {
  const { server, url } = await setup();
  assert.equal((await fetch(`${url}/..%2fsegreto.txt`)).status, 403);
  assert.equal((await fetch(`${url}/manca.js`)).status, 404);
  assert.equal((await fetch(`${url}/%E0%A4%A`)).status, 400);
  assert.equal((await fetch(`${url}/`, { method: 'POST' })).status, 405);
  server.close();
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../server.js'`.

- [ ] **Step 3: Implementa `server.js`**

```js
// Server locale: serve public/. Nella tappa 3 farà anche da proxy a Jev, così la chiave resta qui.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml'
};

export function createServer(root = ROOT) {
  return http.createServer(async (req, res) => {
    if (req.method !== 'GET') { res.writeHead(405).end(); return; }
    let rel;
    try {
      const pathname = new URL(req.url, 'http://localhost').pathname;
      rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
    } catch {
      res.writeHead(400).end();
      return;
    }
    const file = path.join(root, path.normalize(rel));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end('non trovato');
    }
  });
}

// Solo loopback: nessun altro sulla rete vede il gioco (né, dalla tappa 3, la chiave di Jev).
export function startServer(port = Number(process.env.PORT) || 5178) {
  return new Promise(resolve => {
    const server = createServer();
    server.listen(port, '127.0.0.1', () => resolve(server));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const server = await startServer();
  console.log(`Universalis Romae su http://localhost:${server.address().port}`);
}
```

In `package.json`, aggiungi a `scripts`: `"start": "node server.js"`.

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 77 test.

- [ ] **Step 5: Commit**

```bash
git add server.js package.json test/server.test.js
git commit -m "feat: server statico locale"
```

---

### Task 2: Geometria, camera, selezione — *inline*

**Files:**
- Create: `public/js/ui/geom.js`, `public/js/ui/camera.js`, `public/js/ui/hit.js`
- Modify: `tools/geo.js` (usa `geom.js` invece delle sue copie di `pointInRing` e `bbox`)
- Test: `test/geom-camera.test.js`

**Interfaces:**
- Produces:
  - `geom.js`: `pointInRing([x, y], ring)`, `pointInPolygon(pt, poly)`, `bboxOf(multi) → [x0, y0, x1, y1]`.
  - `camera.js`: `createCamera(viewW, viewH, worldW, worldH) → { scale, x, y, min, max }`, `toWorld(cam, sx, sy) → [wx, wy]`, `toScreen(cam, wx, wy) → [sx, sy]`, `zoomAt(cam, sx, sy, factor)`, `pan(cam, dx, dy)`, `centerOn(cam, viewW, viewH, wx, wy)`.
  - `hit.js`: `buildIndex(map) → [{ id, bbox, poligoni }]`, `provinceAt(index, wx, wy) → id|null`, `armyAt(markers, sx, sy, radius = 12) → id|null` (markers: `[{ id, x, y }]` in coordinate schermo).
  - `tools/geo.js` continua a esportare `pointInRing` (riesportato da `geom.js`).

- [ ] **Step 1: Scrivi il test che fallisce `test/geom-camera.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pointInPolygon, bboxOf } from '../public/js/ui/geom.js';
import { createCamera, toWorld, toScreen, zoomAt, pan, centerOn } from '../public/js/ui/camera.js';
import { buildIndex, provinceAt, armyAt } from '../public/js/ui/hit.js';
import { loadData } from '../tools/load-data.js';

const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s], [x, y]];

test('punto nel poligono con buco e riquadro', () => {
  const ciambella = [sq(0, 0, 10), sq(4, 4, 2)];
  assert.equal(pointInPolygon([1, 1], ciambella), true);
  assert.equal(pointInPolygon([5, 5], ciambella), false);
  assert.deepEqual(bboxOf([[sq(2, 3, 4)], [sq(10, 0, 1)]]), [2, 0, 11, 7]);
});

test('camera: adatta, converte avanti e indietro, zoom sul cursore, limiti', () => {
  const cam = createCamera(500, 900, 1000, 1200);
  assert.equal(cam.scale, 0.5);
  assert.deepEqual([cam.x, cam.y], [0, 150]);
  const [wx, wy] = toWorld(cam, 120, 340);
  assert.deepEqual(toScreen(cam, wx, wy), [120, 340]);
  zoomAt(cam, 120, 340, 2);
  assert.equal(cam.scale, 1);
  const [sx, sy] = toScreen(cam, wx, wy);
  assert.ok(Math.abs(sx - 120) < 1e-9 && Math.abs(sy - 340) < 1e-9);
  zoomAt(cam, 0, 0, 1000);
  assert.equal(cam.scale, cam.max);
  zoomAt(cam, 0, 0, 0.0001);
  assert.equal(cam.scale, cam.min);
  pan(cam, 10, -5);
  centerOn(cam, 500, 900, 500, 600);
  assert.deepEqual(toScreen(cam, 500, 600), [250, 450]);
});

test('provincia e esercito sotto il mouse', () => {
  const map = { province: [{ id: 'a', poligoni: [[sq(0, 0, 10)]] }, { id: 'b', poligoni: [[sq(10, 0, 10)]] }] };
  const idx = buildIndex(map);
  assert.equal(provinceAt(idx, 5, 5), 'a');
  assert.equal(provinceAt(idx, 15, 5), 'b');
  assert.equal(provinceAt(idx, 50, 50), null);
  const markers = [{ id: 'e1', x: 100, y: 100 }, { id: 'e2', x: 108, y: 100 }];
  assert.equal(armyAt(markers, 107, 101), 'e2');
  assert.equal(armyAt(markers, 200, 200), null);
});

test('sulla mappa reale il centro di ogni provincia cade nella provincia', () => {
  const { map } = loadData();
  const idx = buildIndex(map);
  const sbagliate = map.province.filter(p => provinceAt(idx, ...p.centro) !== p.id).map(p => p.id);
  assert.deepEqual(sbagliate, []);
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../public/js/ui/geom.js'`.

- [ ] **Step 3: Implementa**

`public/js/ui/geom.js`:

```js
// Geometria piana condivisa tra gioco e strumenti. Poligono = [anello esterno, ...buchi].
export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(pt, poly) {
  return pointInRing(pt, poly[0]) && !poly.slice(1).some(h => pointInRing(pt, h));
}

export function bboxOf(multi) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of multi) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}
```

`public/js/ui/camera.js`:

```js
// Trasformazione mappa → schermo: schermo = mondo * scale + (x, y).
export function createCamera(viewW, viewH, worldW, worldH) {
  const fit = Math.min(viewW / worldW, viewH / worldH);
  return { scale: fit, x: (viewW - worldW * fit) / 2, y: (viewH - worldH * fit) / 2, min: fit * 0.8, max: fit * 8 };
}

export function toWorld(cam, sx, sy) {
  return [(sx - cam.x) / cam.scale, (sy - cam.y) / cam.scale];
}

export function toScreen(cam, wx, wy) {
  return [wx * cam.scale + cam.x, wy * cam.scale + cam.y];
}

// Lo zoom tiene fermo il punto sotto il cursore.
export function zoomAt(cam, sx, sy, factor) {
  const [wx, wy] = toWorld(cam, sx, sy);
  cam.scale = Math.max(cam.min, Math.min(cam.max, cam.scale * factor));
  cam.x = sx - wx * cam.scale;
  cam.y = sy - wy * cam.scale;
}

export function pan(cam, dx, dy) {
  cam.x += dx;
  cam.y += dy;
}

export function centerOn(cam, viewW, viewH, wx, wy) {
  cam.x = viewW / 2 - wx * cam.scale;
  cam.y = viewH / 2 - wy * cam.scale;
}
```

`public/js/ui/hit.js`:

```js
// Cosa c'è sotto il mouse: una provincia (coordinate mappa) o un esercito (coordinate schermo).
import { pointInPolygon, bboxOf } from './geom.js';

export function buildIndex(map) {
  return map.province.map(p => ({ id: p.id, bbox: bboxOf(p.poligoni), poligoni: p.poligoni }));
}

export function provinceAt(index, wx, wy) {
  for (const e of index) {
    const [x0, y0, x1, y1] = e.bbox;
    if (wx < x0 || wx > x1 || wy < y0 || wy > y1) continue;
    if (e.poligoni.some(poly => pointInPolygon([wx, wy], poly))) return e.id;
  }
  return null;
}

export function armyAt(markers, sx, sy, radius = 12) {
  let best = null, bestDist = Infinity;
  for (const m of markers) {
    const d = Math.hypot(m.x - sx, m.y - sy);
    if (d <= radius && d < bestDist) { best = m.id; bestDist = d; }
  }
  return best;
}
```

In `tools/geo.js`: sostituisci la funzione `pointInRing` con

```js
import { pointInRing, bboxOf } from '../public/js/ui/geom.js';
export { pointInRing };
```

(l'import va in testa, accanto agli altri), cancella la funzione privata `bbox` e usa `bboxOf` al suo posto in `buildAdjacency` (`const boxes = cells.map(c => bboxOf(c.poligoni));`).

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 81 test. Se l'ultimo test elenca province, scrivile nel registro con un `Ruling:`: il centro di quelle province va spostato in `data/centri.json` (e la mappa rigenerata), non va cambiato il test.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/geom.js public/js/ui/camera.js public/js/ui/hit.js tools/geo.js test/geom-camera.test.js
git commit -m "feat: geometria condivisa, camera e selezione sulla mappa"
```

---

### Task 3: Modelli dei pannelli e colori — *inline*

**Files:**
- Create: `public/js/ui/views.js`, `public/js/ui/colors.js`
- Modify: `public/js/sim/war.js` (campo `parti` nel log della pace)
- Test: `test/views.test.js`

**Interfaces:**
- Consumes: moduli `sim/` della tappa 1.
- Produces:
  - Log della pace: `{ tipo: 'pace', guerra, ricevente, parti: [id], province }`.
  - `colors.js`: `TERRENO`, `RELAZIONE`, `cultureColor(cultura) → 'hsl(...)'`, `provinceFill(game, prov, modo, giocatore)` con `modo` in `'politica' | 'cultura' | 'terreno' | 'relazioni'`.
  - `views.js`:
    - `formatTratti(tratti) → string`
    - `topBar(game, g) → { data, tesoro, entrate, uomini, stabilita, infamia }` (stringhe)
    - `peopleCards(popoli) → [{ id, nome, colore, difficolta, governo, capitale, tratti, carattere }]` (ordinati per difficoltà poi nome)
    - `provinceInfo(game, id, g) → { id, nome, proprietario: {id, nome}, occupante: {id, nome}|null, cultura, terreno, tasse, uomini, fort, eserciti: [{ id, nazione, mio, uomini, morale }], puoReclutare }`
    - `governmentView(game, g) → { nome, governo, stabilita, tratti, costoStabilita, puoAlzare }`
    - `diplomacyView(game, g) → [{ id, nome, stato: 'guerra'|'tregua'|'pace', finoA, pretesto, costo, puoDichiarare }]`
    - `warsView(game, g) → [{ id, nemico: {id, nome}, ruolo, punteggio, daChiedere: [{id, nome, costo}], daCedere: [{id, nome, costo}], propostaInAttesa }]`
    - `armiesView(game, g) → [{ id, provincia, fanteria, cavalleria, morale, destinazione, inBattaglia }]`
    - `pendingProposals(game, g) → [{ id, da, testo }]`
    - `formatLogEntry(entry, game, g) → string|null`
    - `rankingView(game, g) → [{ pos, nome, punteggio, vivo, tu }]`

- [ ] **Step 1: Scrivi il test che fallisce `test/views.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { loadData } from '../tools/load-data.js';
import { declareWar, proposePeace, makePeace } from '../public/js/sim/war.js';
import { createArmy } from '../public/js/sim/state.js';
import * as V from '../public/js/ui/views.js';
import { provinceFill, cultureColor, RELAZIONE, TERRENO } from '../public/js/ui/colors.js';

test('barra in alto', () => {
  const g = makeGame();
  assert.deepEqual(V.topBar(g, 'roma'), {
    data: '21 aprile 753 a.C. (AUC 1)', tesoro: '3.6', entrate: '+0.04/mese',
    uomini: '1950/3900', stabilita: '0', infamia: '0.0/20'
  });
  g.nazioni.roma.stabilita = 2;
  assert.equal(V.topBar(g, 'roma').stabilita, '+2');
});

test('schede dei popoli: 38, prima i facili, tratti leggibili', () => {
  const cards = V.peopleCards(loadData().popoli);
  assert.equal(cards.length, 38);
  assert.equal(cards[0].id, 'roma');
  assert.equal(cards[0].tratti, 'reclute +50%, stabilità +50%, battaglia +1');
  assert.equal(cards.at(-1).difficolta, 'molto difficile');
  assert.equal(V.formatTratti({ assedio: -0.5, montagna: 2 }), 'assedio -50%, montagna +2');
});

test('provincia: occupazione, eserciti, reclutamento', () => {
  const g = makeGame();
  declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  const v = V.provinceInfo(g, 'c', 'roma');
  assert.deepEqual(v.proprietario, { id: 'volsci', nome: 'volsci' });
  assert.deepEqual(v.occupante, { id: 'roma', nome: 'roma' });
  assert.equal(v.puoReclutare, false);
  const a = V.provinceInfo(g, 'a', 'roma');
  assert.equal(a.occupante, null);
  assert.equal(a.puoReclutare, true);
  assert.deepEqual(a.eserciti.map(e => [e.nazione, e.mio, e.uomini]), [['roma', true, 2574]]);
});

test('governo', () => {
  const g = makeGame();
  assert.deepEqual(V.governmentView(g, 'roma'), {
    nome: 'roma', governo: 'tribù', stabilita: '0', tratti: 'reclute +30%', costoStabilita: '22.0', puoAlzare: false
  });
});

test('diplomazia: vicini, stato, tregua', () => {
  const g = makeGame();
  assert.deepEqual(V.diplomacyView(g, 'roma').map(d => [d.id, d.stato, d.puoDichiarare, d.costo]),
    [['latini', 'pace', true, 2], ['volsci', 'pace', true, 2]]);
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.equal(V.diplomacyView(g, 'roma')[1].stato, 'guerra');
  makePeace(g, guerra, 'roma', { province: [] });
  const d = V.diplomacyView(g, 'roma')[1];
  assert.equal(d.stato, 'tregua');
  assert.equal(d.finoA, '21 aprile 748 a.C. (AUC 6)');
  assert.equal(d.puoDichiarare, false);
});

test('guerre: punteggio, province da chiedere e da cedere', () => {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  const [w] = V.warsView(g, 'roma');
  assert.deepEqual([w.id, w.nemico.id, w.ruolo, w.punteggio], [guerra, 'volsci', 'attaccante', 50]);
  assert.deepEqual(w.daChiedere, [{ id: 'c', nome: 'C', costo: 50 }]);
  assert.deepEqual(V.warsView(g, 'volsci')[0].daCedere, [{ id: 'c', nome: 'C', costo: 50 }]);
  proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'] });
  assert.equal(V.warsView(g, 'roma')[0].propostaInAttesa, true);
  assert.deepEqual(V.pendingProposals(g, 'volsci').map(p => p.testo), ['roma chiede la pace e vuole: C.']);
});

test('eserciti del giocatore', () => {
  const g = makeGame();
  createArmy(g, 'roma', 'b', 500, 50);
  g.eserciti.e5.percorso = ['a'];
  assert.deepEqual(V.armiesView(g, 'roma').map(a => [a.provincia, a.fanteria, a.destinazione]),
    [['A', 2340, null], ['B', 500, 'A']]);
});

test('notizie: guerre e paci per tutti, battaglie solo se ti riguardano', () => {
  const g = makeGame();
  assert.equal(V.formatLogEntry({ tipo: 'guerra', attaccante: 'roma', difensore: 'volsci' }, g, 'siculi'), 'roma dichiara guerra a volsci.');
  assert.equal(V.formatLogEntry({ tipo: 'battaglia', prov: 'c', vincitore: 'roma', sconfitto: 'volsci' }, g, 'siculi'), null);
  assert.equal(V.formatLogEntry({ tipo: 'battaglia', prov: 'c', vincitore: 'roma', sconfitto: 'volsci' }, g, 'volsci'), 'Battaglia a C: vince roma.');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  makePeace(g, guerra, 'roma', { province: ['c'] });
  const pace = g.log.find(e => e.tipo === 'pace');
  assert.deepEqual(pace.parti, ['roma', 'volsci']);
  assert.equal(V.formatLogEntry(pace, g, 'siculi'), 'Pace tra roma e volsci: roma ottiene C.');
  assert.equal(V.formatLogEntry({ tipo: 'proposta' }, g, 'roma'), null);
});

test('classifica', () => {
  const g = makeGame();
  assert.deepEqual(V.rankingView(g, 'latini').slice(0, 2), [
    { pos: 1, nome: 'roma', punteggio: 8, vivo: true, tu: false },
    { pos: 2, nome: 'latini', punteggio: 7, vivo: true, tu: true }
  ]);
});

test('colori per modalità', () => {
  const g = makeGame();
  const c = g.province.c;
  assert.equal(provinceFill(g, c, 'politica', 'roma'), '#888888');
  assert.equal(provinceFill(g, c, 'terreno', 'roma'), TERRENO.montagna);
  assert.equal(provinceFill(g, c, 'cultura', 'roma'), cultureColor('volsca'));
  assert.notEqual(cultureColor('latina'), cultureColor('volsca'));
  assert.equal(provinceFill(g, g.province.a, 'relazioni', 'roma'), RELAZIONE.tu);
  assert.equal(provinceFill(g, c, 'relazioni', 'roma'), RELAZIONE.neutrale);
  declareWar(g, 'roma', 'volsci');
  assert.equal(provinceFill(g, c, 'relazioni', 'roma'), RELAZIONE.guerra);
  assert.equal(provinceFill(g, c, 'relazioni', null), RELAZIONE.neutrale);
});
```

Nota sul test "diplomazia": tregua di 1825 giorni dal giorno 0 = giorno 1825 = 21 aprile 748 a.C. (5 anni di 365 giorni), AUC 6.

- [ ] **Step 2: Verifica che fallisca**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../public/js/ui/views.js'`.

- [ ] **Step 3: Aggiungi `parti` al log della pace in `public/js/sim/war.js`**

Sostituisci la riga

```js
  log(game, { tipo: 'pace', guerra: warId, ricevente: receiver, province: [...termini.province] });
```

con

```js
  log(game, { tipo: 'pace', guerra: warId, ricevente: receiver, parti, province: [...termini.province] });
```

(`parti` è già calcolato più sopra nella stessa funzione.)

- [ ] **Step 4: Implementa `public/js/ui/colors.js`**

```js
// Colori delle province per modalità della mappa.
import { atWar, inTruce } from '../sim/war.js';

export const TERRENO = { pianura: '#c8cf8f', collina: '#b9a56d', montagna: '#8d7d6a', palude: '#7d9a86' };
export const RELAZIONE = { tu: '#d4a017', guerra: '#b03a2e', tregua: '#e08e3c', neutrale: '#d9ccaa' };

export function cultureColor(cultura) {
  let h = 0;
  for (const ch of cultura) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, 42%, 58%)`;
}

export function provinceFill(game, prov, modo, giocatore) {
  switch (modo) {
    case 'cultura': return cultureColor(prov.cultura);
    case 'terreno': return TERRENO[prov.terreno];
    case 'relazioni':
      if (!giocatore) return RELAZIONE.neutrale;
      if (prov.owner === giocatore) return RELAZIONE.tu;
      if (atWar(game, giocatore, prov.owner)) return RELAZIONE.guerra;
      if (inTruce(game, giocatore, prov.owner)) return RELAZIONE.tregua;
      return RELAZIONE.neutrale;
    default:
      return game.nazioni[prov.owner].colore;
  }
}
```

- [ ] **Step 5: Implementa `public/js/ui/views.js`**

```js
// Modelli dei pannelli: dallo stato di gioco ai dati pronti da mostrare. Niente DOM.
import { formatDate } from '../sim/calendar.js';
import { maxManpower, armiesOf, bordersNation } from '../sim/state.js';
import { monthlyIncome, monthlyUpkeep, stabilityCost } from '../sim/economy.js';
import { atWar, inTruce, hasPretext, sideOf, enemiesOf, scoreFor, peaceCost } from '../sim/war.js';
import { ranking } from '../sim/score.js';

const DIFFICOLTA = ['facile', 'normale', 'difficile', 'molto difficile'];
const pct = v => Math.round(v * 100);
const TRATTI = {
  reclute: v => `reclute +${pct(v)}%`,
  stabilita: v => `stabilità +${pct(v)}%`,
  assimilazione: v => `assimilazione +${pct(v)}%`,
  battaglia: v => `battaglia +${v}`,
  montagna: v => `montagna +${v}`,
  assedio: v => `assedio ${v > 0 ? '+' : ''}${pct(v)}%`
};
const segno = n => (n > 0 ? `+${n}` : `${n}`);
const byNome = (a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0);
const nome = (game, id) => game.nazioni[id]?.nome ?? id;

export function formatTratti(tratti) {
  return Object.entries(tratti).map(([k, v]) => (TRATTI[k] ? TRATTI[k](v) : `${k} ${v}`)).join(', ');
}

export function topBar(game, g) {
  const n = game.nazioni[g];
  const netto = monthlyIncome(game, g) - monthlyUpkeep(game, g);
  return {
    data: formatDate(game.day),
    tesoro: n.tesoro.toFixed(1),
    entrate: `${netto >= 0 ? '+' : ''}${netto.toFixed(2)}/mese`,
    uomini: `${n.uomini}/${maxManpower(game, g)}`,
    stabilita: segno(n.stabilita),
    infamia: `${n.infamia.toFixed(1)}/${game.balance.infamia.soglia}`
  };
}

export function peopleCards(popoli) {
  return popoli.popoli.filter(p => !p.dormiente)
    .map(p => ({
      id: p.id, nome: p.nome, colore: p.colore, difficolta: p.difficolta, governo: p.governo,
      capitale: p.capitale, tratti: formatTratti(p.tratti), carattere: p.carattere
    }))
    .sort((a, b) => DIFFICOLTA.indexOf(a.difficolta) - DIFFICOLTA.indexOf(b.difficolta) || byNome(a, b));
}

export function provinceInfo(game, id, g) {
  const p = game.province[id];
  return {
    id, nome: p.nome,
    proprietario: { id: p.owner, nome: nome(game, p.owner) },
    occupante: p.controller !== p.owner ? { id: p.controller, nome: nome(game, p.controller) } : null,
    cultura: p.cultura, terreno: p.terreno, tasse: p.tasse, uomini: p.uomini, fort: p.fort,
    eserciti: Object.values(game.eserciti).filter(a => a.prov === id).map(a => ({
      id: a.id, nazione: nome(game, a.owner), mio: a.owner === g,
      uomini: a.fanteria + a.cavalleria, morale: a.morale.toFixed(1)
    })),
    puoReclutare: Boolean(g) && p.owner === g && p.controller === g
  };
}

export function governmentView(game, g) {
  const n = game.nazioni[g], costo = stabilityCost(game, g);
  return {
    nome: n.nome, governo: n.governo, stabilita: segno(n.stabilita), tratti: formatTratti(n.tratti),
    costoStabilita: costo.toFixed(1), puoAlzare: n.stabilita < 3 && n.tesoro >= costo
  };
}

export function diplomacyView(game, g) {
  return game.ordine
    .filter(id => id !== g && game.nazioni[id].vivo && bordersNation(game, g, id))
    .map(id => {
      const guerra = atWar(game, g, id), tregua = !guerra && inTruce(game, g, id);
      const pretesto = hasPretext(game, g, id);
      return {
        id, nome: nome(game, id), stato: guerra ? 'guerra' : tregua ? 'tregua' : 'pace',
        finoA: tregua ? formatDate(game.nazioni[g].tregue[id]) : null,
        pretesto, costo: pretesto ? 0 : game.balance.guerra.senzaPretesto,
        puoDichiarare: !guerra && !tregua
      };
    })
    .sort(byNome);
}

export function warsView(game, g) {
  const prov = Object.values(game.province);
  return Object.values(game.guerre).filter(w => sideOf(w, g)).map(w => {
    const side = sideOf(w, g), nemici = enemiesOf(w, side), mine = w[side];
    const costo = (ricevente, id) => Math.round(peaceCost(game, w, ricevente, { province: [id] }));
    return {
      id: w.id,
      nemico: { id: nemici[0], nome: nome(game, nemici[0]) },
      ruolo: side === 'attaccanti' ? 'attaccante' : 'difensore',
      punteggio: Math.round(scoreFor(game, w, g)),
      daChiedere: prov.filter(p => nemici.includes(p.owner) && mine.includes(p.controller))
        .map(p => ({ id: p.id, nome: p.nome, costo: costo(g, p.id) })),
      daCedere: prov.filter(p => mine.includes(p.owner) && nemici.includes(p.controller))
        .map(p => ({ id: p.id, nome: p.nome, costo: costo(nemici[0], p.id) })),
      propostaInAttesa: Object.values(game.proposte).some(p => p.guerra === w.id && p.da === g)
    };
  });
}

export function armiesView(game, g) {
  return armiesOf(game, g).map(a => ({
    id: a.id, provincia: game.province[a.prov].nome, fanteria: a.fanteria, cavalleria: a.cavalleria,
    morale: a.morale.toFixed(1),
    destinazione: a.percorso.length ? game.province[a.percorso[a.percorso.length - 1]].nome : null,
    inBattaglia: a.inBattaglia
  }));
}

export function pendingProposals(game, g) {
  return Object.values(game.proposte).filter(p => p.a === g).map(p => {
    const nomi = p.termini.province.map(id => game.province[id].nome).join(', ');
    let testo;
    if (!p.termini.province.length) testo = `${nome(game, p.da)} propone una pace bianca.`;
    else if (p.termini.ricevente === g) testo = `${nome(game, p.da)} offre la pace e ti cede: ${nomi}.`;
    else testo = `${nome(game, p.da)} chiede la pace e vuole: ${nomi}.`;
    return { id: p.id, da: nome(game, p.da), testo };
  });
}

// Notizie: guerre, paci ed eliminazioni per tutti; battaglie, assedi e rifiuti solo se riguardano il giocatore.
export function formatLogEntry(e, game, g) {
  const N = id => nome(game, id), P = id => game.province[id]?.nome ?? id;
  switch (e.tipo) {
    case 'guerra': return `${N(e.attaccante)} dichiara guerra a ${N(e.difensore)}.`;
    case 'pace': {
      const altri = e.parti.filter(x => x !== e.ricevente).map(N).join(', ');
      return e.province.length
        ? `Pace tra ${N(e.ricevente)} e ${altri}: ${N(e.ricevente)} ottiene ${e.province.map(P).join(', ')}.`
        : `Pace bianca tra ${N(e.ricevente)} e ${altri}.`;
    }
    case 'eliminata': return `${N(e.nazione)} scompare dalla storia.`;
    case 'battaglia':
      return [e.vincitore, e.sconfitto].includes(g) ? `Battaglia a ${P(e.prov)}: vince ${N(e.vincitore)}.` : null;
    case 'assedio':
      return e.nazione === g || game.province[e.prov]?.owner === g ? `${N(e.nazione)} conquista ${P(e.prov)}.` : null;
    case 'rifiutata': return e.da === g ? `${N(e.a)} rifiuta la tua proposta di pace.` : null;
    default: return null;
  }
}

export function rankingView(game, g) {
  return ranking(game).map((r, i) => ({ pos: i + 1, nome: nome(game, r.id), punteggio: r.punteggio, vivo: r.vivo, tu: r.id === g }));
}
```

- [ ] **Step 6: Verifica che passino**

Run: `npm test`
Expected: PASS, 91 test. Se `cultureColor('latina')` e `cultureColor('volsca')` coincidono, cambia il moltiplicatore dell'hash in `cultureColor` (31 → 37) e annota un `Ruling:`.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/views.js public/js/ui/colors.js public/js/sim/war.js test/views.test.js
git commit -m "feat: modelli dei pannelli, notizie e colori della mappa"
```

---

### Task 4: Orologio e sessione del giocatore — *inline*

**Files:**
- Create: `public/js/ui/clock.js`, `public/js/ui/session.js`
- Test: `test/clock-session.test.js`

**Interfaces:**
- Consumes: `createGame`, `advanceDay`, `isOver`, `isNewYear`, `rulesController`, `formatLogEntry`.
- Produces:
  - `clock.js`: `SPEEDS`, `createClock() → { velocita: 3, pausa: true, accumulo: 0, ultimo: null }`, `setSpeed(clock, v)`, `setPaused(clock, pausa)`, `tick(clock, nowMs) → giorni da simulare` (massimo 10).
  - `session.js`: `controllersFor(game, giocatore)`, `createSessionFrom(game, giocatore, seme) → { game, giocatore, seme, controllers }`, `createSession(data, giocatore, seme)`, `pausaNecessaria(session) → null|'fine'|'sconfitta'|'proposta'`, `runDays(session, days, { onYear }) → { giorni, motivo, notizie: [string] }`.

- [ ] **Step 1: Scrivi il test che fallisce `test/clock-session.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../tools/load-data.js';
import { createClock, setSpeed, setPaused, tick } from '../public/js/ui/clock.js';
import { createSession, runDays, pausaNecessaria } from '../public/js/ui/session.js';
import { declareWar, proposePeace } from '../public/js/sim/war.js';
import { END_DAY } from '../public/js/sim/calendar.js';

test('orologio: pausa, accumulo, velocità, tetto per fotogramma', () => {
  const c = createClock();
  assert.equal(tick(c, 0), 0); // in pausa
  setPaused(c, false);
  assert.equal(tick(c, 1000), 0); // primo fotogramma: solo riferimento
  assert.equal(tick(c, 1450), 2); // velocità 3 = 200 ms/giorno
  assert.equal(tick(c, 1600), 1); // 50 avanzati + 150
  assert.equal(tick(c, 61600), 10); // scheda rimasta inattiva: tetto
  assert.equal(c.accumulo, 0);
  setSpeed(c, 9);
  assert.equal(c.velocita, 5);
  setSpeed(c, 0);
  assert.equal(c.velocita, 1);
});

const data = loadData();

test('sessione: il giocatore non ha controller, gli altri sì', () => {
  const s = createSession(data, 'roma', 1);
  assert.equal(Object.keys(s.controllers).length, 37);
  assert.equal(s.controllers.roma, undefined);
  const r = runDays(s, 30);
  assert.equal(r.giorni, 30);
  assert.equal(s.game.day, 30);
});

test('sessione: si ferma per una proposta al giocatore, la fine, la sconfitta', () => {
  const s = createSession(data, 'roma', 1);
  const { guerra } = declareWar(s.game, 'veio', 'roma');
  proposePeace(s.game, 'veio', guerra, { ricevente: 'veio', province: [] });
  assert.deepEqual(runDays(s, 10), { giorni: 0, motivo: 'proposta', notizie: [] });
  s.game.proposte = {};
  s.game.day = END_DAY;
  assert.equal(pausaNecessaria(s), 'fine');
  s.game.day = 0;
  s.game.nazioni.roma.vivo = false;
  assert.equal(pausaNecessaria(s), 'sconfitta');
});

test('sessione: richiamo a ogni capodanno e notizie', () => {
  const s = createSession(data, 'roma', 1);
  let anni = 0;
  // una proposta dell'IA al giocatore ferma il tempo: la si scarta e si riparte
  while (s.game.day < 300) {
    s.game.proposte = {};
    const r = runDays(s, 300 - s.game.day, { onYear: () => anni++ });
    assert.ok(Array.isArray(r.notizie));
  }
  assert.equal(anni, 1); // il 1 gennaio 752 a.C. è il giorno 255
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../public/js/ui/clock.js'`.

- [ ] **Step 3: Implementa**

`public/js/ui/clock.js`:

```js
// Orologio di gioco: trasforma il tempo reale in giorni da simulare.
export const SPEEDS = [1000, 500, 200, 100, 50]; // millisecondi per giorno, velocità 1..5
const MAX_PER_FRAME = 10;

export function createClock() {
  return { velocita: 3, pausa: true, accumulo: 0, ultimo: null };
}

export function setSpeed(clock, v) {
  clock.velocita = Math.max(1, Math.min(5, v));
}

export function setPaused(clock, pausa) {
  clock.pausa = pausa;
  clock.ultimo = null;
  clock.accumulo = 0;
}

export function tick(clock, now) {
  if (clock.pausa) { clock.ultimo = null; return 0; }
  if (clock.ultimo === null) { clock.ultimo = now; return 0; }
  clock.accumulo += now - clock.ultimo;
  clock.ultimo = now;
  const ms = SPEEDS[clock.velocita - 1];
  const n = Math.floor(clock.accumulo / ms);
  clock.accumulo -= n * ms;
  // scheda rimasta inattiva: non si recupera tutto il tempo perso
  if (n > MAX_PER_FRAME) { clock.accumulo = 0; return MAX_PER_FRAME; }
  return n;
}
```

`public/js/ui/session.js`:

```js
// Partita del giocatore: gli altri popoli hanno un controller, il giocatore comanda dall'interfaccia.
import { createGame } from '../sim/setup.js';
import { advanceDay, isOver } from '../sim/loop.js';
import { isNewYear } from '../sim/calendar.js';
import { rulesController } from '../ai/rules.js';
import { formatLogEntry } from './views.js';

export function controllersFor(game, giocatore) {
  return Object.fromEntries(game.ordine.filter(id => id !== giocatore).map(id => [id, rulesController]));
}

export function createSessionFrom(game, giocatore, seme) {
  return { game, giocatore, seme, controllers: controllersFor(game, giocatore) };
}

export function createSession(data, giocatore, seme) {
  return createSessionFrom(createGame({ ...data, seed: seme }), giocatore, seme);
}

// Perché il gioco deve fermarsi adesso, se deve.
export function pausaNecessaria(session) {
  const { game, giocatore } = session;
  if (isOver(game)) return 'fine';
  if (!game.nazioni[giocatore].vivo) return 'sconfitta';
  if (Object.values(game.proposte).some(p => p.a === giocatore)) return 'proposta';
  return null;
}

export function runDays(session, days, { onYear } = {}) {
  const notizie = [];
  let giorni = 0;
  let motivo = pausaNecessaria(session);
  while (!motivo && giorni < days) {
    const log = advanceDay(session.game, session.controllers);
    giorni++;
    for (const e of log) {
      const t = formatLogEntry(e, session.game, session.giocatore);
      if (t) notizie.push(t);
    }
    if (onYear && isNewYear(session.game.day)) onYear(session);
    motivo = pausaNecessaria(session);
  }
  return { giorni, motivo, notizie };
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 95 test.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/clock.js public/js/ui/session.js test/clock-session.test.js
git commit -m "feat: orologio di gioco e sessione del giocatore"
```

---

### Task 5: Salvataggi — *inline*

**Files:**
- Create: `public/js/ui/save.js`
- Test: `test/save.test.js`

**Interfaces:**
- Consumes: `createSessionFrom`, `END_DAY`.
- Produces: `SAVE_VERSION = 1`, `AUTOSAVE_KEY = 'universalis-romae:autosave'`, `serialize(session) → string` (`{ versione, giocatore, seme, game }` senza `game.balance`), `deserialize(text, data) → { ok: true, session } | { ok: false, motivo }` (rimette `data.balance`), `writeStorage(storage, key, text) → bool`, `readStorage(storage, key) → string|null`.

- [ ] **Step 1: Scrivi il test che fallisce `test/save.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../tools/load-data.js';
import { createSession, runDays } from '../public/js/ui/session.js';
import { serialize, deserialize, writeStorage, readStorage, AUTOSAVE_KEY } from '../public/js/ui/save.js';

const data = loadData();

test('andata e ritorno: stessa partita, bilanciamento non salvato', () => {
  const s = createSession(data, 'volsci', 4);
  runDays(s, 200);
  const text = serialize(s);
  assert.equal(text.includes('"economia"'), false);
  const r = deserialize(text, data);
  assert.equal(r.ok, true);
  assert.equal(r.session.giocatore, 'volsci');
  assert.equal(r.session.seme, 4);
  assert.deepEqual(r.session.game, s.game);
  assert.equal(r.session.controllers.volsci, undefined);
  runDays(s, 100);
  runDays(r.session, 100);
  assert.deepEqual(r.session.game, s.game);
});

test('file non validi: rifiutati con un motivo', () => {
  const s = createSession(data, 'roma', 1);
  const good = JSON.parse(serialize(s));
  const bad = [
    'boh',
    JSON.stringify({ ...good, versione: 99 }),
    JSON.stringify({ ...good, giocatore: 'atlantide' }),
    JSON.stringify({ ...good, game: { ...good.game, day: -3 } }),
    JSON.stringify({ ...good, game: { ...good.game, province: { roma: good.game.province.roma } } }),
    JSON.stringify({ ...good, game: { ...good.game, eserciti: null } })
  ];
  for (const text of bad) {
    const r = deserialize(text, data);
    assert.equal(r.ok, false, text.slice(0, 40));
    assert.match(r.motivo, /non valido/);
  }
});

test('storage: funziona, e se manca o esplode non rompe nulla', () => {
  const mem = new Map();
  const ok = { setItem: (k, v) => mem.set(k, v), getItem: k => mem.get(k) ?? null };
  assert.equal(writeStorage(ok, AUTOSAVE_KEY, 'x'), true);
  assert.equal(readStorage(ok, AUTOSAVE_KEY), 'x');
  const broken = { setItem() { throw new Error('quota'); }, getItem() { throw new Error('vietato'); } };
  assert.equal(writeStorage(broken, AUTOSAVE_KEY, 'x'), false);
  assert.equal(readStorage(broken, AUTOSAVE_KEY), null);
  assert.equal(writeStorage(null, AUTOSAVE_KEY, 'x'), false);
  assert.equal(readStorage(null, AUTOSAVE_KEY), null);
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../public/js/ui/save.js'`.

- [ ] **Step 3: Implementa `public/js/ui/save.js`**

```js
// Salvataggi: file JSON esportabili e salvataggio automatico nel browser.
import { END_DAY } from '../sim/calendar.js';
import { createSessionFrom } from './session.js';

export const SAVE_VERSION = 1;
export const AUTOSAVE_KEY = 'universalis-romae:autosave';

// Il bilanciamento non si salva: al caricamento vale quello corrente.
export function serialize(session) {
  const { balance, ...game } = session.game;
  return JSON.stringify({ versione: SAVE_VERSION, giocatore: session.giocatore, seme: session.seme, game });
}

export function deserialize(text, data) {
  let s;
  try { s = JSON.parse(text); } catch { return { ok: false, motivo: 'file non valido: non è un salvataggio' }; }
  if (!s || s.versione !== SAVE_VERSION || typeof s.game !== 'object' || !s.game) {
    return { ok: false, motivo: 'file non valido: non è un salvataggio di Universalis Romae (o è di un\'altra versione)' };
  }
  const g = s.game;
  const ids = data.map.province.map(p => p.id);
  if (typeof g.province !== 'object' || !g.province || Object.keys(g.province).length !== ids.length || ids.some(id => !g.province[id])) {
    return { ok: false, motivo: 'salvataggio non valido: la mappa è diversa' };
  }
  if (!Number.isInteger(g.day) || g.day < 0 || g.day > END_DAY) return { ok: false, motivo: 'salvataggio non valido: data impossibile' };
  if (!Array.isArray(g.ordine) || typeof g.nazioni !== 'object' || !g.nazioni?.[s.giocatore]) {
    return { ok: false, motivo: 'salvataggio non valido: popolo del giocatore sconosciuto' };
  }
  for (const k of ['eserciti', 'guerre', 'proposte']) {
    if (typeof g[k] !== 'object' || g[k] === null) return { ok: false, motivo: 'salvataggio non valido: dati mancanti' };
  }
  return { ok: true, session: createSessionFrom({ ...g, balance: data.balance }, s.giocatore, s.seme) };
}

export function writeStorage(storage, key, text) {
  try { storage.setItem(key, text); return true; } catch { return false; }
}

export function readStorage(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 98 test.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/save.js test/save.test.js
git commit -m "feat: salvataggi con validazione e storage sicuro"
```

---

### Task 6: Pagina, mappa, schermata iniziale, orologio — *inline*

**Files:**
- Create: `public/index.html`, `public/css/style.css`, `public/js/main.js`, `public/js/ui/renderer.js`, `public/js/ui/input.js`, `public/js/ui/panels.js`, `tools/smoke.mjs`
- Modify: `package.json` (devDependency `playwright-core@1.63.0`, script `smoke`), `.gitignore` (`smoke-*.png`)

**Interfaces:**
- Consumes: tutti i moduli `ui/` dei task 2–5.
- Produces:
  - `renderer.js`: `createRenderer(canvas, map) → { resize() → {w, h}, draw({ game, giocatore, modo, selezione, camera, evidenzia }), markers() → [{id, x, y}] }`.
  - `input.js`: `attachInput(canvas, { onClick, onRightClick, onPan, onZoom, onKey })` (`onKey` restituisce `true` se ha usato il tasto).
  - `panels.js`: `esc`, `cardsHtml(cards, scelto)`, `cardDetailHtml(card)` (gli altri costruttori arrivano nel task 7).
  - `main.js`: espone `window.universalis = { ui, data, toScreen(wx, wy), avanza(n) }` per la prova di fumo.
  - `tools/smoke.mjs`: controlli in sequenza; ogni task successivo aggiunge i suoi prima della riga `// @@ controlli successivi @@`.

- [ ] **Step 1: Installa playwright-core e scrivi la prova di fumo che fallisce**

Run: `npm install --save-dev --save-exact playwright-core@1.63.0`
Expected: `added 1 package`.

In `package.json` aggiungi a `scripts`: `"smoke": "node tools/smoke.mjs"`. In `.gitignore` aggiungi la riga `smoke-*.png`.

`tools/smoke.mjs`:

```js
// Prova di fumo nel browser: avvia il server, apre il gioco in Chromium headless e controlla i passaggi base.
// Uso: npm run smoke (usa il Chromium di Playwright in cache, oppure CHROME_PATH).
import { chromium } from 'playwright-core';
import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { startServer } from '../server.js';

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const base = path.join(homedir(), 'Library/Caches/ms-playwright');
  const dirs = existsSync(base) ? readdirSync(base).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse() : [];
  for (const d of dirs) {
    for (const sub of readdirSync(path.join(base, d))) {
      const exe = path.join(base, d, sub, 'chrome-headless-shell');
      if (existsSync(exe)) return exe;
    }
  }
  throw new Error('Chromium non trovato: imposta CHROME_PATH');
}

const failures = [];
function check(cond, msg) {
  if (!cond) failures.push(msg);
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
}
const wait = ms => new Promise(r => setTimeout(r, ms));

const server = await startServer(0);
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: chromePath() });
const context = await browser.newContext({ viewport: { width: 1400, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

// Clic sullo schermo nel punto della mappa dove sta il centro di una provincia.
async function clickProvince(id, button = 'left') {
  const [x, y] = await page.evaluate(pid => {
    const p = window.universalis.data.map.province.find(q => q.id === pid);
    return window.universalis.toScreen(...p.centro);
  }, id);
  const box = await page.locator('#mappa').boundingBox();
  await page.mouse.click(box.x + x, box.y + y, { button });
}

try {
  await page.goto(url);
  await page.waitForSelector('#inizio-lista .carta');

  // --- schermata iniziale e orologio (task 6)
  check((await page.locator('#inizio-lista .carta').count()) === 38, '38 popoli nella schermata iniziale');
  await page.click('[data-popolo="roma"]');
  check((await page.textContent('#inizio-scheda')).includes('facile'), 'Roma risulta facile');
  check(!(await page.isDisabled('#inizio-via')), 'Inizia attivo dopo la scelta');
  await page.screenshot({ path: 'smoke-inizio.png' });
  await page.click('#inizio-via');
  await page.waitForSelector('#barra:not([hidden])');
  check((await page.textContent('#b-data')) === '21 aprile 753 a.C. (AUC 1)', 'data iniziale nella barra');
  check(await page.isHidden('#inizio'), 'schermata iniziale chiusa');
  await page.keyboard.press('5');
  check((await page.textContent('#b-vel')) === 'velocità 5', 'tasto 5: velocità massima');
  await page.keyboard.press(' ');
  await wait(1200);
  await page.keyboard.press(' ');
  const giorno = await page.evaluate(() => window.universalis.ui.session.game.day);
  check(giorno >= 10, `il tempo scorre (giorno ${giorno})`);
  await wait(300);
  check(await page.evaluate(() => window.universalis.ui.session.game.day) === giorno, 'la pausa ferma il tempo');
  await page.click('[data-modo="terreno"]');
  check(await page.evaluate(() => window.universalis.ui.modo) === 'terreno', 'modalità terreno');
  await page.click('[data-modo="politica"]');

  // @@ controlli successivi @@
  await page.screenshot({ path: 'smoke-gioco.png' });
} catch (e) {
  failures.push(`eccezione: ${e.message}`);
  console.log(`FAIL eccezione: ${e.message}`);
} finally {
  check(errors.length === 0, `nessun errore in console${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error(`\n${failures.length} controlli falliti`);
  process.exit(1);
}
console.log('\nsmoke ok');
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npm run smoke`
Expected: FAIL, eccezione di timeout su `#inizio-lista .carta` (la pagina non esiste: 404).

- [ ] **Step 3: Scrivi `public/index.html`**

```html
<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Universalis Romae</title>
  <link rel="stylesheet" href="css/style.css">
</head>
<body>
  <header id="barra" hidden>
    <span id="b-data"></span>
    <span class="voce" title="Tesoro e saldo mensile">Tesoro <b id="b-tesoro"></b> <small id="b-entrate"></small></span>
    <span class="voce" title="Uomini disponibili / massimo">Uomini <b id="b-uomini"></b></span>
    <span class="voce">Stabilità <b id="b-stabilita"></b></span>
    <span class="voce" title="Infamia / soglia delle coalizioni">Infamia <b id="b-infamia"></b></span>
    <span>
      <button id="b-pausa" title="Pausa: barra spaziatrice">▶</button>
      <button id="b-meno" title="Più lento: tasto −">−</button>
      <span id="b-vel"></span>
      <button id="b-piu" title="Più veloce: tasto +">+</button>
    </span>
    <span id="b-modi">
      <button data-modo="politica" class="attivo">Politica</button>
      <button data-modo="cultura">Cultura</button>
      <button data-modo="terreno">Terreno</button>
      <button data-modo="relazioni">Relazioni</button>
    </span>
    <span>
      <button id="b-esporta">Esporta</button>
      <label class="bottone">Importa<input class="importa" type="file" accept=".json,application/json" hidden></label>
    </span>
  </header>
  <main class="senza-pannello">
    <canvas id="mappa"></canvas>
    <aside id="pannello" hidden>
      <div id="provincia"><p class="muto">Clic su una provincia per vederla.</p></div>
      <div class="schede" id="schede">
        <button data-scheda="governo" class="attivo">Governo</button>
        <button data-scheda="diplomazia">Diplomazia</button>
        <button data-scheda="eserciti">Eserciti</button>
        <button data-scheda="guerre">Guerre</button>
      </div>
      <div id="scheda"></div>
    </aside>
    <section id="inizio">
      <h1>Universalis Romae</h1>
      <div class="muto">Italia, 753 a.C. Scegli un popolo dalla lista o sulla mappa.</div>
      <div id="inizio-lista"></div>
      <div id="inizio-scheda"><p class="muto">Nessun popolo scelto.</p></div>
      <div class="comandi">
        <label>Seme <input id="inizio-seme" type="number" min="1" value="1"></label>
        <button id="inizio-via" disabled>Inizia</button>
        <button id="inizio-continua" hidden>Continua</button>
        <label class="bottone">Importa<input class="importa" type="file" accept=".json,application/json" hidden></label>
      </div>
    </section>
    <div id="notizie"></div>
    <div id="avviso" hidden></div>
    <div id="finestra" hidden><div id="finestra-corpo"></div></div>
  </main>
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

- [ ] **Step 4: Scrivi `public/css/style.css`**

```css
:root {
  --pergamena: #efe3c8; --inchiostro: #2b2118; --bordo: #8b6d47; --accento: #8b1e1e;
  --mare: #a9c4c9; --pannello: #f6eedb; --riga: #e2d4b4;
}
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--pergamena); color: var(--inchiostro); font: 14px/1.4 Georgia, 'Times New Roman', serif; }
body { display: grid; grid-template-rows: auto 1fr; overflow: hidden; }
header#barra { display: flex; gap: 14px; align-items: center; padding: 6px 12px; background: #3b2a1a; color: #f3e6c8; flex-wrap: wrap; }
header#barra[hidden] { display: none; }
#b-data { font-weight: bold; min-width: 240px; }
.voce b { color: #fff; }
#b-vel { display: inline-block; min-width: 80px; text-align: center; }
button, .bottone { font: inherit; background: var(--pannello); color: var(--inchiostro); border: 1px solid var(--bordo); border-radius: 4px; padding: 3px 9px; cursor: pointer; }
button:hover:not(:disabled), .bottone:hover { background: #fff7e3; }
button:disabled { opacity: .5; cursor: default; }
button.attivo { background: var(--accento); color: #fff; border-color: var(--accento); }
main { position: relative; display: grid; grid-template-columns: 1fr 360px; min-height: 0; }
main.senza-pannello { grid-template-columns: 1fr; }
canvas#mappa { width: 100%; height: 100%; display: block; background: var(--mare); cursor: crosshair; }
aside#pannello { overflow-y: auto; background: var(--pannello); border-left: 2px solid var(--bordo); padding: 10px 12px; }
aside#pannello[hidden] { display: none; }
h2, h3 { margin: .4em 0; font-variant: small-caps; letter-spacing: .03em; }
.schede { display: flex; gap: 4px; margin: 10px 0 6px; flex-wrap: wrap; }
table { border-collapse: collapse; width: 100%; }
td { padding: 2px 4px; border-bottom: 1px solid var(--riga); vertical-align: top; }
.riga { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--riga); }
.riga.scelta { background: #fff7e3; }
.muto { color: #7a6a55; font-size: 12px; }
.guerra { color: #b03a2e; font-weight: bold; }
.comandi { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 8px; }
#inizio { position: absolute; left: 12px; top: 12px; bottom: 12px; width: 420px; display: flex; flex-direction: column; background: rgba(246, 238, 219, .96); border: 2px solid var(--bordo); border-radius: 6px; padding: 12px; }
#inizio[hidden] { display: none; }
#inizio h1 { margin: 0 0 4px; font-variant: small-caps; color: var(--accento); }
#inizio-lista { overflow-y: auto; flex: 1; margin: 8px 0; }
.carta { display: flex; align-items: center; gap: 8px; padding: 5px 6px; border-radius: 4px; cursor: pointer; }
.carta:hover, .carta.scelta { background: #fff7e3; outline: 1px solid var(--bordo); }
.colore { width: 14px; height: 14px; border-radius: 3px; border: 1px solid #0006; flex: none; }
.diff { margin-left: auto; font-size: 12px; }
.diff-facile { color: #2e7d32; } .diff-normale { color: #6d5d2e; } .diff-difficile { color: #b8621b; } .diff-molto-difficile { color: #b03a2e; }
#inizio-scheda { min-height: 120px; border-top: 1px solid var(--bordo); padding-top: 8px; }
#notizie { position: absolute; left: 12px; bottom: 12px; max-width: 480px; pointer-events: none; display: flex; flex-direction: column; gap: 3px; }
#notizie div { background: rgba(43, 33, 24, .82); color: #f3e6c8; padding: 3px 8px; border-radius: 3px; font-size: 13px; }
#avviso { position: absolute; left: 50%; top: 14px; transform: translateX(-50%); background: var(--accento); color: #fff; padding: 6px 14px; border-radius: 4px; z-index: 5; }
#avviso[hidden] { display: none; }
#finestra { position: absolute; inset: 0; background: rgba(30, 20, 10, .45); display: grid; place-items: center; z-index: 4; }
#finestra[hidden] { display: none; }
#finestra-corpo { background: var(--pannello); border: 2px solid var(--bordo); border-radius: 6px; padding: 16px 20px; max-width: 520px; max-height: 80vh; overflow-y: auto; }
input[type=number] { width: 80px; font: inherit; }
```

- [ ] **Step 5: Scrivi `public/js/ui/renderer.js`**

```js
// Disegno della mappa su Canvas 2D: province, occupazioni, selezione, percorso, eserciti.
import { provinceFill } from './colors.js';
import { toScreen } from './camera.js';

function toPath(multi) {
  const path = new Path2D();
  for (const poly of multi) for (const ring of poly) {
    ring.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
  }
  return path;
}

export function createRenderer(canvas, map) {
  const ctx = canvas.getContext('2d');
  const paths = Object.fromEntries(map.province.map(p => [p.id, toPath(p.poligoni)]));
  const centri = Object.fromEntries(map.province.map(p => [p.id, p.centro]));
  const decor = map.decorazioni.map(d => ({ tipo: d.tipo, path: toPath(d.poligoni) }));
  const stripes = {};
  let markers = [];
  let size = { w: 0, h: 0 };

  // Righe diagonali nel colore di chi occupa la provincia.
  function stripe(color) {
    if (stripes[color]) return stripes[color];
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d');
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, 8); g.lineTo(8, 0);
    g.moveTo(-2, 2); g.lineTo(2, -2);
    g.moveTo(6, 10); g.lineTo(10, 6);
    g.stroke();
    return (stripes[color] = ctx.createPattern(c, 'repeat'));
  }

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    size = { w: r.width, h: r.height };
    return size;
  }

  function draw({ game, giocatore, modo, selezione, camera, evidenzia }) {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#a9c4c9';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.x, dpr * camera.y);
    for (const d of decor) {
      ctx.fillStyle = d.tipo === 'incognita' ? '#b9b2a2' : '#e3d5b0';
      ctx.fill(d.path);
    }
    const provs = Object.values(game.province);
    for (const p of provs) {
      ctx.fillStyle = provinceFill(game, p, modo, giocatore);
      ctx.fill(paths[p.id]);
      if (p.controller !== p.owner) {
        ctx.fillStyle = stripe(game.nazioni[p.controller].colore);
        ctx.fill(paths[p.id]);
      }
    }
    const lw = 1 / camera.scale;
    ctx.strokeStyle = 'rgba(43, 33, 24, 0.5)';
    ctx.lineWidth = 0.7 * lw;
    for (const p of provs) ctx.stroke(paths[p.id]);
    if (evidenzia) {
      ctx.strokeStyle = '#1b120a';
      ctx.lineWidth = 2.2 * lw;
      for (const p of provs) if (p.owner === evidenzia) ctx.stroke(paths[p.id]);
    }
    if (selezione.provincia) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5 * lw;
      ctx.stroke(paths[selezione.provincia]);
    }
    const sel = selezione.esercito && game.eserciti[selezione.esercito];
    if (sel && sel.percorso.length) {
      ctx.strokeStyle = '#8b1e1e';
      ctx.lineWidth = 2 * lw;
      ctx.setLineDash([6 * lw, 4 * lw]);
      ctx.beginPath();
      ctx.moveTo(...centri[sel.prov]);
      for (const id of sel.percorso) ctx.lineTo(...centri[id]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (camera.scale >= 1.6) {
      ctx.fillStyle = 'rgba(27, 18, 10, 0.75)';
      ctx.font = `${10 * lw}px Georgia`;
      ctx.textAlign = 'center';
      for (const p of provs) ctx.fillText(p.nome, centri[p.id][0], centri[p.id][1] - 6 * lw);
    }

    // eserciti in coordinate schermo, così restano leggibili a ogni zoom
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    markers = [];
    const perProv = {};
    for (const a of Object.values(game.eserciti)) (perProv[a.prov] ??= []).push(a);
    ctx.font = 'bold 11px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [prov, list] of Object.entries(perProv)) {
      const [cx, cy] = toScreen(camera, ...centri[prov]);
      list.forEach((a, i) => {
        const x = cx + (i - (list.length - 1) / 2) * 30, y = cy + 10;
        const men = a.fanteria + a.cavalleria;
        const scelto = a.id === selezione.esercito;
        ctx.fillStyle = game.nazioni[a.owner].colore;
        ctx.strokeStyle = scelto ? '#ffffff' : '#1b120a';
        ctx.lineWidth = scelto ? 3 : 1;
        ctx.beginPath();
        ctx.roundRect(x - 14, y - 8, 28, 16, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(men >= 1000 ? `${(men / 1000).toFixed(1)}k` : String(men), x, y + 0.5);
        if (a.inBattaglia) { ctx.fillStyle = '#b03a2e'; ctx.fillText('⚔', x + 19, y); }
        markers.push({ id: a.id, x, y });
      });
    }
    ctx.textBaseline = 'alphabetic';
  }

  return { resize, draw, markers: () => markers };
}
```

- [ ] **Step 6: Scrivi `public/js/ui/input.js`**

```js
// Mouse e tastiera sulla mappa: clic, clic destro, trascinamento, rotella, tasti.
export function attachInput(canvas, h) {
  let down = null;
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) down = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, drag: false };
  });
  window.addEventListener('mousemove', e => {
    if (!down) return;
    if (!down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.drag = true;
    if (down.drag) {
      h.onPan(e.clientX - down.lastX, e.clientY - down.lastY);
      down.lastX = e.clientX;
      down.lastY = e.clientY;
    }
  });
  window.addEventListener('mouseup', e => {
    if (!down) return;
    const wasDrag = down.drag;
    down = null;
    if (!wasDrag && e.button === 0) {
      const r = canvas.getBoundingClientRect();
      h.onClick(e.clientX - r.left, e.clientY - r.top);
    }
  });
  canvas.addEventListener('contextmenu', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    h.onRightClick(e.clientX - r.left, e.clientY - r.top);
  });
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    h.onZoom(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015));
  }, { passive: false });
  window.addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea')) return;
    if (h.onKey(e.key)) e.preventDefault();
  });
}
```

- [ ] **Step 7: Scrivi `public/js/ui/panels.js` (prima parte)**

```js
// Costruttori di HTML per i pannelli: ricevono i modelli di views.js e restituiscono stringhe.
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const diffClass = d => `diff-${d.replace(' ', '-')}`;

export function cardsHtml(cards, scelto) {
  return cards.map(c => `<div class="carta${c.id === scelto ? ' scelta' : ''}" data-popolo="${esc(c.id)}">` +
    `<span class="colore" style="background:${esc(c.colore)}"></span>${esc(c.nome)}` +
    `<span class="diff ${diffClass(c.difficolta)}">${esc(c.difficolta)}</span></div>`).join('');
}

export function cardDetailHtml(c) {
  return `<h3>${esc(c.nome)}</h3>` +
    `<div>Difficoltà: <b class="${diffClass(c.difficolta)}">${esc(c.difficolta)}</b> · ${esc(c.governo)}</div>` +
    `<div class="muto">${esc(c.tratti || 'nessun tratto')}</div><p>${esc(c.carattere)}</p>`;
}
```

- [ ] **Step 8: Scrivi `public/js/main.js`**

```js
// Regia dell'interfaccia: schermata iniziale, ciclo di gioco, barra, mappa e comandi del giocatore.
import { createGame } from './sim/setup.js';
import { createRenderer } from './ui/renderer.js';
import { createCamera, toWorld, toScreen, zoomAt, pan, centerOn } from './ui/camera.js';
import { buildIndex, provinceAt, armyAt } from './ui/hit.js';
import { attachInput } from './ui/input.js';
import { createClock, tick, setSpeed, setPaused } from './ui/clock.js';
import { createSession, runDays, pausaNecessaria } from './ui/session.js';
import * as V from './ui/views.js';
import * as H from './ui/panels.js';

const $ = id => document.getElementById(id);

async function loadData() {
  const get = f => fetch(`data/${f}`).then(r => {
    if (!r.ok) throw new Error(`${f}: ${r.status}`);
    return r.json();
  });
  const [map, popoli, balance] = await Promise.all(['map.json', 'popoli.json', 'balance.json'].map(get));
  return { map, popoli, balance };
}

const data = await loadData();
const canvas = $('mappa');
const renderer = createRenderer(canvas, data.map);
const index = buildIndex(data.map);
const cards = V.peopleCards(data.popoli);
const centroDi = id => data.map.province.find(p => p.id === id).centro;

const ui = {
  session: null,
  anteprima: createGame({ ...data, seed: 1 }),
  scelto: null,
  selezione: { provincia: null, esercito: null },
  modo: 'politica', scheda: 'governo',
  clock: createClock(), camera: null, size: { w: 0, h: 0 },
  notizie: [], sporco: true
};
window.universalis = { ui, data, toScreen: (x, y) => toScreen(ui.camera, x, y), avanza: n => avanza(n) };

const game = () => (ui.session ? ui.session.game : ui.anteprima);

function resize() {
  ui.size = renderer.resize();
  if (!ui.camera) ui.camera = createCamera(ui.size.w, ui.size.h, data.map.width, data.map.height);
  ui.sporco = true;
}
new ResizeObserver(resize).observe(canvas);
resize();

// --- schermata iniziale

function renderInizio() {
  $('inizio-lista').innerHTML = H.cardsHtml(cards, ui.scelto);
  const c = cards.find(x => x.id === ui.scelto);
  $('inizio-scheda').innerHTML = c ? H.cardDetailHtml(c) : '<p class="muto">Nessun popolo scelto.</p>';
  $('inizio-via').disabled = !c;
  ui.sporco = true;
}

function scegli(id) {
  ui.scelto = id;
  renderInizio();
}

$('inizio-lista').addEventListener('click', e => {
  const el = e.target.closest('[data-popolo]');
  if (el) scegli(el.dataset.popolo);
});

$('inizio-via').addEventListener('click', () => {
  const seme = Math.max(1, Math.floor(Number($('inizio-seme').value) || 1));
  avvia(createSession(data, ui.scelto, seme));
});

function avvia(session) {
  ui.session = session;
  ui.scelto = null;
  ui.selezione = { provincia: null, esercito: null };
  ui.notizie = [];
  setPaused(ui.clock, true);
  $('inizio').hidden = true;
  $('barra').hidden = false;
  $('pannello').hidden = false;
  document.querySelector('main').classList.remove('senza-pannello');
  resize();
  ui.camera.scale = Math.min(ui.camera.max, (ui.camera.min / 0.8) * 3);
  centerOn(ui.camera, ui.size.w, ui.size.h, ...centroDi(session.game.nazioni[session.giocatore].capitale));
  aggiorna();
}

// --- tempo

function avanza(n) {
  if (!ui.session) return;
  const r = runDays(ui.session, n);
  if (r.notizie.length) ui.notizie = [...ui.notizie, ...r.notizie].slice(-8);
  if (r.motivo) setPaused(ui.clock, true);
  aggiorna();
}

function togglePausa() {
  if (!ui.session) return;
  if (ui.clock.pausa && pausaNecessaria(ui.session)) return;
  setPaused(ui.clock, !ui.clock.pausa);
  aggiorna();
}

function velocita(v) {
  setSpeed(ui.clock, v);
  aggiorna();
}

function frame(now) {
  if (ui.session) {
    const n = tick(ui.clock, now);
    if (n) avanza(n);
  }
  if (ui.sporco) {
    renderer.draw({
      game: game(), giocatore: ui.session?.giocatore ?? null, modo: ui.modo,
      selezione: ui.selezione, camera: ui.camera, evidenzia: ui.session ? null : ui.scelto
    });
    ui.sporco = false;
  }
  requestAnimationFrame(frame);
}

// --- pannelli

function aggiorna() {
  ui.sporco = true;
  if (!ui.session) return;
  const { game: g, giocatore } = ui.session;
  const b = V.topBar(g, giocatore);
  for (const k of ['data', 'tesoro', 'entrate', 'uomini', 'stabilita', 'infamia']) $(`b-${k}`).textContent = b[k];
  $('b-pausa').textContent = ui.clock.pausa ? '▶' : '❚❚';
  $('b-vel').textContent = `velocità ${ui.clock.velocita}`;
  $('notizie').innerHTML = ui.notizie.map(t => `<div>${H.esc(t)}</div>`).join('');
}

// --- comandi della barra

$('b-modi').addEventListener('click', e => {
  const b = e.target.closest('[data-modo]');
  if (!b) return;
  ui.modo = b.dataset.modo;
  for (const x of $('b-modi').children) x.classList.toggle('attivo', x === b);
  ui.sporco = true;
});
$('b-pausa').addEventListener('click', togglePausa);
$('b-meno').addEventListener('click', () => velocita(ui.clock.velocita - 1));
$('b-piu').addEventListener('click', () => velocita(ui.clock.velocita + 1));

// --- mappa

attachInput(canvas, {
  onPan: (dx, dy) => { pan(ui.camera, dx, dy); ui.sporco = true; },
  onZoom: (x, y, f) => { zoomAt(ui.camera, x, y, f); ui.sporco = true; },
  onClick: (x, y) => {
    const prov = provinceAt(index, ...toWorld(ui.camera, x, y));
    if (!ui.session) { if (prov) scegli(game().province[prov].owner); return; }
    ui.selezione.provincia = prov;
    aggiorna();
  },
  onRightClick: () => {},
  onKey: k => {
    if (!ui.session) return false;
    if (k === ' ') { togglePausa(); return true; }
    if (k === '+' || k === '=') { velocita(ui.clock.velocita + 1); return true; }
    if (k === '-') { velocita(ui.clock.velocita - 1); return true; }
    if (/^[1-5]$/.test(k)) { velocita(Number(k)); return true; }
    if (k === 'Escape') { ui.selezione = { provincia: null, esercito: null }; aggiorna(); return true; }
    return false;
  }
});

renderInizio();
requestAnimationFrame(frame);
```

`armyAt` è importato ma usato solo nel task 7: è voluto, così il task 7 non tocca gli import.

- [ ] **Step 9: Verifica che la prova di fumo passi**

Run: `npm run smoke`
Expected: tutte le righe `ok`, poi `smoke ok`. Apri `smoke-inizio.png` e `smoke-gioco.png` (con il Read tool) e controlla a occhio: mappa colorata per popolo, lista dei popoli leggibile, barra in alto, mappa centrata su Roma.

- [ ] **Step 10: Verifica che i test unitari restino verdi**

Run: `npm test`
Expected: PASS, 98 test.

- [ ] **Step 11: Commit**

```bash
git add public/index.html public/css/style.css public/js/main.js public/js/ui/renderer.js public/js/ui/input.js public/js/ui/panels.js tools/smoke.mjs package.json package-lock.json .gitignore
git commit -m "feat: pagina di gioco, mappa su canvas, schermata iniziale e orologio"
```

---

### Task 7: Pannello laterale, eserciti e comandi — *inline*

**Files:**
- Modify: `public/js/ui/panels.js` (costruttori dei pannelli), `public/js/main.js` (pannelli, azioni, selezione degli eserciti, clic destro), `tools/smoke.mjs` (controlli del task 7)

**Interfaces:**
- Consumes: `views.js` (task 3), `applyCommand`.
- Produces:
  - `panels.js`: `provinceHtml(v)`, `governoHtml(v)`, `diplomaziaHtml(list)`, `esercitiHtml(list, selezionato)`, `guerreHtml(list)`.
  - Azioni nell'HTML (`data-azione`): `recluta` (data-id provincia, legge `#r-fanti` e `#r-cavalieri`), `alza-stabilita`, `dichiara` (data-id), `seleziona-esercito` (data-id), `chiedi` / `cedi` (data-id guerra, `data-nemico`, legge le caselle `chiedi-<guerra>` / `cedi-<guerra>`), `pace-bianca` (data-id guerra).
  - `main.js`: `comando(cmd)` aggiunge `nazione: giocatore`, mostra `motivo` nell'avviso se rifiutato; `setHtml(el, html)` ridisegna solo se cambia e conserva caselle spuntate, numeri e focus.

- [ ] **Step 1: Aggiungi i controlli del task 7 alla prova di fumo**

In `tools/smoke.mjs`, prima della riga `// @@ controlli successivi @@`, inserisci:

```js
  // --- pannelli, eserciti e comandi (task 7)
  await clickProvince('roma');
  check((await page.textContent('#provincia h2')) === 'Roma', 'clic su Roma apre la sua scheda');
  const prima = await page.evaluate(() => Object.values(window.universalis.ui.session.game.eserciti).filter(a => a.owner === 'roma').reduce((s, a) => s + a.fanteria, 0));
  await page.fill('#r-fanti', '100');
  await page.fill('#r-cavalieri', '0');
  await page.click('[data-azione="recluta"]');
  const dopo = await page.evaluate(() => Object.values(window.universalis.ui.session.game.eserciti).filter(a => a.owner === 'roma').reduce((s, a) => s + a.fanteria, 0));
  check(dopo === prima + 100, `reclutamento: fanti ${prima} → ${dopo}`);
  await page.click('[data-scheda="diplomazia"]');
  await page.click('[data-azione="dichiara"][data-id="veio"]');
  await page.click('[data-scheda="guerre"]');
  check((await page.textContent('#scheda')).includes('Contro Veio'), 'guerra a Veio nella scheda Guerre');
  await page.click('[data-scheda="eserciti"]');
  await page.click('#scheda [data-azione="seleziona-esercito"]');
  check(await page.evaluate(() => Boolean(window.universalis.ui.selezione.esercito)), 'esercito selezionato');
  await clickProvince('veio', 'right');
  check(await page.evaluate(() => {
    const u = window.universalis.ui;
    return u.session.game.eserciti[u.selezione.esercito].percorso.at(-1) === 'veio';
  }), 'clic destro su Veio: esercito in marcia');
  await clickProvince('syrakousai', 'right');
  check((await page.textContent('#avviso')) === 'nessun percorso', 'destinazione irraggiungibile: avviso');
  // il pannello si ridisegna mentre il gioco scorre: le scelte restano
  await page.evaluate(() => {
    const g = window.universalis.ui.session.game;
    g.province.fidenae.controller = 'roma';
  });
  await page.click('[data-scheda="guerre"]');
  await page.check('input[name^="chiedi-"][value="fidenae"]');
  // pausa con il bottone: la barra spaziatrice su una casella la toglierebbe
  await page.click('#b-pausa');
  await wait(400);
  await page.click('#b-pausa');
  check(await page.isChecked('input[name^="chiedi-"][value="fidenae"]'), 'la casella spuntata resta spuntata mentre il tempo scorre');
  // esercito selezionato che scompare
  await page.evaluate(() => {
    const u = window.universalis.ui;
    delete u.session.game.eserciti[u.selezione.esercito];
    window.universalis.avanza(1);
  });
  check(await page.evaluate(() => window.universalis.ui.selezione.esercito === null), 'esercito scomparso: selezione azzerata');
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npm run smoke`
Expected: FAIL su `clic su Roma apre la sua scheda` (il pannello della provincia non viene ancora riempito) e sui controlli seguenti.

- [ ] **Step 3: Aggiungi i costruttori a `public/js/ui/panels.js`**

In fondo al file:

```js
export function provinceHtml(v) {
  const righe = [['Proprietario', v.proprietario.nome], ...(v.occupante ? [['Occupata da', v.occupante.nome]] : []),
    ['Cultura', v.cultura], ['Terreno', v.terreno], ['Tasse', v.tasse], ['Uomini', v.uomini], ['Fortificazione', v.fort]];
  const eserciti = v.eserciti.length
    ? v.eserciti.map(e => `<div class="riga"><span>${esc(e.nazione)}: ${e.uomini} uomini, morale ${esc(e.morale)}</span>` +
      (e.mio ? `<button data-azione="seleziona-esercito" data-id="${esc(e.id)}">Seleziona</button>` : '') + '</div>').join('')
    : '<p class="muto">Nessun esercito.</p>';
  const recluta = v.puoReclutare
    ? '<h3>Recluta</h3><div class="comandi">' +
      '<label>Fanti <input id="r-fanti" type="number" min="0" step="100" value="1000"></label>' +
      '<label>Cavalieri <input id="r-cavalieri" type="number" min="0" step="100" value="0"></label>' +
      `<button data-azione="recluta" data-id="${esc(v.id)}">Recluta</button></div>`
    : '';
  return `<h2>${esc(v.nome)}</h2><table>${righe.map(([k, x]) => `<tr><td>${k}</td><td>${esc(x)}</td></tr>`).join('')}</table>` +
    `<h3>Eserciti</h3>${eserciti}${recluta}`;
}

export function governoHtml(v) {
  return `<h3>${esc(v.nome)}</h3><table>` +
    `<tr><td>Governo</td><td>${esc(v.governo)}</td></tr>` +
    `<tr><td>Stabilità</td><td>${esc(v.stabilita)}</td></tr>` +
    `<tr><td>Tratti</td><td>${esc(v.tratti || 'nessuno')}</td></tr></table>` +
    `<div class="comandi"><button data-azione="alza-stabilita"${v.puoAlzare ? '' : ' disabled'}>Alza stabilità (${esc(v.costoStabilita)} denari)</button></div>`;
}

export function diplomaziaHtml(list) {
  if (!list.length) return '<p class="muto">Nessun vicino.</p>';
  return list.map(d => {
    const stato = d.stato === 'guerra' ? '<span class="guerra">in guerra</span>'
      : d.stato === 'tregua' ? `tregua fino al ${esc(d.finoA)}` : 'in pace';
    const bottone = d.puoDichiarare
      ? `<button data-azione="dichiara" data-id="${esc(d.id)}">Dichiara guerra${d.costo ? ` (−${d.costo} stab.)` : ''}</button>` : '';
    return `<div class="riga"><span>${esc(d.nome)} <span class="muto">${stato}</span></span>${bottone}</div>`;
  }).join('');
}

export function esercitiHtml(list, selezionato) {
  if (!list.length) return '<p class="muto">Nessun esercito. Recluta da una tua provincia.</p>';
  return list.map(a => `<div class="riga${a.id === selezionato ? ' scelta' : ''}"><span>${esc(a.provincia)}: ` +
    `${a.fanteria} fanti, ${a.cavalleria} cavalieri, morale ${esc(a.morale)}` +
    (a.destinazione ? ` → ${esc(a.destinazione)}` : '') +
    (a.inBattaglia ? ' <span class="guerra">in battaglia</span>' : '') +
    `</span><button data-azione="seleziona-esercito" data-id="${esc(a.id)}">Seleziona</button></div>`).join('') +
    '<p class="muto">Seleziona un esercito, poi clic destro sulla destinazione.</p>';
}

function caselle(nome, list) {
  return list.map(p => `<label class="riga"><span><input type="checkbox" name="${esc(nome)}" value="${esc(p.id)}"> ${esc(p.nome)}</span>` +
    `<span class="muto">costo ${p.costo}</span></label>`).join('');
}

export function guerreHtml(list) {
  if (!list.length) return '<p class="muto">Nessuna guerra.</p>';
  return list.map(w => `<div><h3>Contro ${esc(w.nemico.nome)}</h3><div>Sei ${w.ruolo}. Punteggio: <b>${w.punteggio}</b></div>` +
    (w.daChiedere.length ? `<div class="muto">Province occupate che puoi chiedere:</div>${caselle(`chiedi-${w.id}`, w.daChiedere)}` : '') +
    (w.daCedere.length ? `<div class="muto">Tue province occupate che puoi cedere:</div>${caselle(`cedi-${w.id}`, w.daCedere)}` : '') +
    '<div class="comandi">' + (w.propostaInAttesa
      ? '<span class="muto">Proposta in attesa di risposta.</span>'
      : `<button data-azione="chiedi" data-id="${esc(w.id)}" data-nemico="${esc(w.nemico.id)}">Chiedi le province</button>` +
        `<button data-azione="cedi" data-id="${esc(w.id)}" data-nemico="${esc(w.nemico.id)}">Cedi e fai la pace</button>` +
        `<button data-azione="pace-bianca" data-id="${esc(w.id)}" data-nemico="${esc(w.nemico.id)}">Pace bianca</button>`) +
    '</div></div>').join('');
}
```

- [ ] **Step 4: Collega pannelli e comandi in `public/js/main.js`**

Nota: la scheda Guerre mostra Veio perché Roma confina con Veio e Fidenae (di Veio); i Sabini non confinano con Roma.

Aggiungi l'import di `applyCommand` accanto agli altri:

```js
import { applyCommand } from './sim/commands.js';
```

Sostituisci la funzione `aggiorna` con:

```js
function aggiorna() {
  ui.sporco = true;
  if (!ui.session) return;
  const { game: g, giocatore } = ui.session;
  if (ui.selezione.esercito && !g.eserciti[ui.selezione.esercito]) ui.selezione.esercito = null;
  const b = V.topBar(g, giocatore);
  for (const k of ['data', 'tesoro', 'entrate', 'uomini', 'stabilita', 'infamia']) $(`b-${k}`).textContent = b[k];
  $('b-pausa').textContent = ui.clock.pausa ? '▶' : '❚❚';
  $('b-vel').textContent = `velocità ${ui.clock.velocita}`;
  $('notizie').innerHTML = ui.notizie.map(t => `<div>${H.esc(t)}</div>`).join('');
  setHtml($('provincia'), ui.selezione.provincia
    ? H.provinceHtml(V.provinceInfo(g, ui.selezione.provincia, giocatore))
    : '<p class="muto">Clic su una provincia per vederla.</p>');
  const schede = {
    governo: () => H.governoHtml(V.governmentView(g, giocatore)),
    diplomazia: () => H.diplomaziaHtml(V.diplomacyView(g, giocatore)),
    eserciti: () => H.esercitiHtml(V.armiesView(g, giocatore), ui.selezione.esercito),
    guerre: () => H.guerreHtml(V.warsView(g, giocatore))
  };
  setHtml($('scheda'), schede[ui.scheda]());
}

// Ridisegna solo se l'HTML cambia, e conserva caselle spuntate, numeri scritti e focus.
const ultimoHtml = new WeakMap();
function setHtml(el, html) {
  if (ultimoHtml.get(el) === html) return;
  const spuntate = new Set([...el.querySelectorAll('input[type=checkbox]:checked')].map(i => `${i.name}=${i.value}`));
  const numeri = Object.fromEntries([...el.querySelectorAll('input[type=number]')].map(i => [i.id, i.value]));
  const focus = el.contains(document.activeElement) ? document.activeElement.id : null;
  el.innerHTML = html;
  ultimoHtml.set(el, html);
  for (const i of el.querySelectorAll('input[type=checkbox]')) if (spuntate.has(`${i.name}=${i.value}`)) i.checked = true;
  for (const i of el.querySelectorAll('input[type=number]')) if (numeri[i.id] !== undefined) i.value = numeri[i.id];
  if (focus) document.getElementById(focus)?.focus();
}

// --- comandi del giocatore

let avvisoTimer = null;
function avviso(testo) {
  const el = $('avviso');
  el.textContent = testo;
  el.hidden = false;
  clearTimeout(avvisoTimer);
  avvisoTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

function comando(cmd) {
  const r = applyCommand(ui.session.game, { ...cmd, nazione: ui.session.giocatore });
  if (!r.ok) avviso(r.motivo);
  aggiorna();
  return r;
}

function selezionaEsercito(id, centra) {
  const a = ui.session.game.eserciti[id];
  if (!a) return;
  ui.selezione.esercito = a.owner === ui.session.giocatore ? id : null;
  ui.selezione.provincia = a.prov;
  if (centra) centerOn(ui.camera, ui.size.w, ui.size.h, ...centroDi(a.prov));
  aggiorna();
}

function proponi(guerra, ricevente, province) {
  const r = comando({ tipo: 'proponi_pace', guerra, termini: { ricevente, province } });
  if (r.ok) avviso('Proposta inviata.');
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-azione]');
  if (!el || !ui.session) return;
  const id = el.dataset.id;
  switch (el.dataset.azione) {
    case 'recluta':
      comando({
        tipo: 'recluta', provincia: id,
        fanteria: Math.floor(Number($('r-fanti').value) || 0),
        cavalleria: Math.floor(Number($('r-cavalieri').value) || 0)
      });
      break;
    case 'alza-stabilita': comando({ tipo: 'alza_stabilita' }); break;
    case 'dichiara': comando({ tipo: 'dichiara_guerra', contro: id }); break;
    case 'seleziona-esercito': selezionaEsercito(id, true); break;
    case 'chiedi':
    case 'cedi': {
      const province = [...document.querySelectorAll(`input[name="${el.dataset.azione}-${id}"]:checked`)].map(i => i.value);
      if (!province.length) { avviso('Scegli almeno una provincia.'); break; }
      proponi(id, el.dataset.azione === 'chiedi' ? ui.session.giocatore : el.dataset.nemico, province);
      break;
    }
    case 'pace-bianca': proponi(id, ui.session.giocatore, []); break;
  }
});

$('schede').addEventListener('click', e => {
  const b = e.target.closest('[data-scheda]');
  if (!b) return;
  ui.scheda = b.dataset.scheda;
  for (const x of $('schede').children) x.classList.toggle('attivo', x === b);
  aggiorna();
});
```

Nel blocco `attachInput`, sostituisci `onClick` e `onRightClick` con:

```js
  onClick: (x, y) => {
    const army = ui.session && armyAt(renderer.markers(), x, y);
    if (army) { selezionaEsercito(army, false); return; }
    const prov = provinceAt(index, ...toWorld(ui.camera, x, y));
    if (!ui.session) { if (prov) scegli(game().province[prov].owner); return; }
    ui.selezione.provincia = prov;
    aggiorna();
  },
  onRightClick: (x, y) => {
    if (!ui.session || !ui.selezione.esercito) return;
    const prov = provinceAt(index, ...toWorld(ui.camera, x, y));
    if (prov) comando({ tipo: 'muovi', esercito: ui.selezione.esercito, verso: prov });
  },
```

- [ ] **Step 5: Verifica che la prova di fumo passi**

Run: `npm run smoke`
Expected: tutte `ok`, `smoke ok`. Guarda `smoke-gioco.png`: pannello a destra con la scheda Guerre, esercito romano con il percorso tratteggiato verso Veio.

- [ ] **Step 6: Verifica i test unitari**

Run: `npm test`
Expected: PASS, 98 test.

- [ ] **Step 7: Commit**

```bash
git add public/js/ui/panels.js public/js/main.js tools/smoke.mjs
git commit -m "feat: pannello laterale, eserciti e comandi del giocatore"
```

---

### Task 8: Proposte, fine partita, salvataggi nell'interfaccia, README — *inline*

**Files:**
- Modify: `public/js/ui/panels.js` (`proposalHtml`, `rankingHtml`), `public/js/main.js` (finestre, salvataggio automatico, esporta, importa, continua), `tools/smoke.mjs`, `README.md`

**Interfaces:**
- Consumes: `save.js` (task 5), `pendingProposals`, `rankingView`.
- Produces: azioni `rispondi` (data-id proposta, `data-accetta` `1`/`0`) e `chiudi`; finestra `#finestra` per proposta, fine e sconfitta.

- [ ] **Step 1: Aggiungi i controlli del task 8 alla prova di fumo**

Prima della riga `// @@ controlli successivi @@`:

```js
  // --- proposte, fine partita, salvataggi (task 8)
  await page.evaluate(async () => {
    const { declareWar, proposePeace } = await import('/js/sim/war.js');
    const g = window.universalis.ui.session.game;
    g.proposte = {};
    const { guerra } = declareWar(g, 'caere', 'roma');
    proposePeace(g, 'caere', guerra, { ricevente: 'caere', province: [] });
    window.universalis.avanza(1);
  });
  check(await page.isVisible('#finestra'), 'proposta al giocatore: finestra aperta');
  check((await page.textContent('#finestra')).includes('pace bianca'), 'testo della proposta');
  await page.click('[data-azione="rispondi"][data-accetta="1"]');
  check(await page.isHidden('#finestra'), 'risposta data: finestra chiusa');
  check(await page.evaluate(() => !Object.values(window.universalis.ui.session.game.guerre).some(w => w.attaccanti.includes('caere'))), 'pace con Caere firmata');

  await page.evaluate(() => {
    const u = window.universalis.ui;
    const fine = u.session.game.day + 400;
    while (u.session.game.day < fine) {
      u.session.game.proposte = {};
      window.universalis.avanza(fine - u.session.game.day);
    }
    document.getElementById('finestra').hidden = true;
  });
  check(await page.evaluate(() => Boolean(localStorage.getItem('universalis-romae:autosave'))), 'salvataggio automatico a capodanno');

  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#b-esporta')]);
  check(/^universalis-romae-roma-giorno-\d+\.json$/.test(download.suggestedFilename()), `esporta: ${download.suggestedFilename()}`);

  const dataPrima = await page.textContent('#b-data');
  await page.setInputFiles('#barra input.importa', { name: 'rotto.json', mimeType: 'application/json', buffer: Buffer.from('boh') });
  check((await page.textContent('#avviso')).includes('non valido'), 'importazione di un file rotto: avviso');
  check((await page.textContent('#b-data')) === dataPrima, 'importazione fallita: la partita resta');

  await page.reload();
  await page.waitForSelector('#inizio-continua:not([hidden])');
  await page.click('#inizio-continua');
  await page.waitForSelector('#barra:not([hidden])');
  check((await page.textContent('#b-data')) !== '21 aprile 753 a.C. (AUC 1)', 'Continua riprende la partita salvata');

  await page.evaluate(async () => {
    const { END_DAY } = await import('/js/sim/calendar.js');
    window.universalis.ui.session.game.proposte = {};
    window.universalis.ui.session.game.day = END_DAY - 1;
    window.universalis.avanza(1);
  });
  check((await page.textContent('#finestra')).includes('Fine della partita'), 'al 264 a.C. compare la classifica');
  await page.click('[data-azione="chiudi"]');
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npm run smoke`
Expected: FAIL su `proposta al giocatore: finestra aperta` e seguenti.

- [ ] **Step 3: Aggiungi i costruttori a `public/js/ui/panels.js`**

```js
export function proposalHtml(p) {
  return `<h3>Proposta di pace</h3><p>${esc(p.testo)}</p><div class="comandi">` +
    `<button data-azione="rispondi" data-id="${esc(p.id)}" data-accetta="1">Accetta</button>` +
    `<button data-azione="rispondi" data-id="${esc(p.id)}" data-accetta="0">Rifiuta</button></div>`;
}

export function rankingHtml(titolo, list) {
  return `<h2>${esc(titolo)}</h2><table>` +
    list.map(r => `<tr${r.tu ? ' style="font-weight:bold"' : ''}><td>${r.pos}</td>` +
      `<td>${esc(r.nome)}${r.vivo ? '' : ' <span class="muto">(scomparso)</span>'}</td><td>${r.punteggio}</td></tr>`).join('') +
    '</table><div class="comandi"><button data-azione="chiudi">Chiudi</button></div>';
}
```

- [ ] **Step 4: Collega finestre e salvataggi in `public/js/main.js`**

Aggiungi l'import:

```js
import { serialize, deserialize, writeStorage, readStorage, AUTOSAVE_KEY } from './ui/save.js';
```

Aggiungi, subito dopo la definizione di `game`:

```js
function storage() {
  try { return window.localStorage; } catch { return null; }
}
```

Sostituisci la funzione `avanza` con:

```js
function avanza(n) {
  if (!ui.session) return;
  const r = runDays(ui.session, n, { onYear: s => writeStorage(storage(), AUTOSAVE_KEY, serialize(s)) });
  if (r.notizie.length) ui.notizie = [...ui.notizie, ...r.notizie].slice(-8);
  if (r.motivo) {
    setPaused(ui.clock, true);
    mostraPausa(r.motivo);
  }
  aggiorna();
}

function mostraPausa(motivo) {
  const { game: g, giocatore } = ui.session;
  if (motivo === 'proposta') finestra(H.proposalHtml(V.pendingProposals(g, giocatore)[0]));
  else if (motivo === 'fine') finestra(H.rankingHtml('Fine della partita: 264 a.C.', V.rankingView(g, giocatore)));
  else if (motivo === 'sconfitta') finestra(H.rankingHtml('Il tuo popolo è scomparso', V.rankingView(g, giocatore)));
}

function finestra(html) {
  $('finestra-corpo').innerHTML = html;
  $('finestra').hidden = false;
}
```

Sostituisci la funzione `togglePausa` con:

```js
function togglePausa() {
  if (!ui.session) return;
  if (ui.clock.pausa) {
    const motivo = pausaNecessaria(ui.session);
    if (motivo) { mostraPausa(motivo); return; }
  }
  setPaused(ui.clock, !ui.clock.pausa);
  aggiorna();
}
```

Nello `switch` del gestore `document.addEventListener('click', ...)`, aggiungi i casi:

```js
    case 'rispondi': {
      $('finestra').hidden = true;
      comando({ tipo: 'rispondi', proposta: id, accetta: el.dataset.accetta === '1' });
      const motivo = pausaNecessaria(ui.session);
      if (motivo) mostraPausa(motivo);
      break;
    }
    case 'chiudi': $('finestra').hidden = true; break;
```

Sopra `renderInizio();` in fondo al file, aggiungi:

```js
// --- salvataggi

function carica(text) {
  const r = deserialize(text, data);
  if (!r.ok) { avviso(r.motivo); return; }
  avvia(r.session);
  avviso('Partita caricata.');
}

if (readStorage(storage(), AUTOSAVE_KEY)) $('inizio-continua').hidden = false;
$('inizio-continua').addEventListener('click', () => carica(readStorage(storage(), AUTOSAVE_KEY)));

$('b-esporta').addEventListener('click', () => {
  if (!ui.session) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([serialize(ui.session)], { type: 'application/json' }));
  a.download = `universalis-romae-${ui.session.giocatore}-giorno-${ui.session.game.day}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

for (const input of document.querySelectorAll('input.importa')) {
  input.addEventListener('change', async () => {
    const file = input.files[0];
    input.value = '';
    if (file) carica(await file.text());
  });
}
```

La funzione `avviso` è definita nel task 7 con una `function` dichiarata, quindi è già visibile qui.

- [ ] **Step 5: Verifica che la prova di fumo passi**

Run: `npm run smoke`
Expected: tutte `ok`, `smoke ok`.

- [ ] **Step 6: Aggiorna `README.md`**

Nella sezione `## Comandi`, aggiungi in cima:

```markdown
- `npm start` — avvia il gioco su http://localhost:5178
- `npm run smoke` — prova di fumo in Chromium headless (serve il Chromium di Playwright in cache, oppure `CHROME_PATH`)
```

E aggiungi una sezione:

```markdown
## Come si gioca

- Scegli un popolo (lista o clic sulla mappa), poi **Inizia**.
- **Barra spaziatrice**: pausa. **1–5** o **+/−**: velocità.
- **Clic** su una provincia: scheda a destra. **Rotella**: zoom. **Trascina**: sposta la mappa.
- **Eserciti**: seleziona (clic sull'etichetta o dalla scheda Eserciti), poi **clic destro** sulla destinazione.
- **Diplomazia**: dichiara guerra ai vicini. **Guerre**: chiedi le province occupate, cedi le tue o proponi la pace bianca.
- Salvataggio automatico ogni anno (Continua nella schermata iniziale); **Esporta/Importa** per i file.
```

- [ ] **Step 7: Verifica i test unitari**

Run: `npm test`
Expected: PASS, 98 test.

- [ ] **Step 8: Commit**

```bash
git add public/js/ui/panels.js public/js/main.js tools/smoke.mjs README.md
git commit -m "feat: proposte di pace, fine partita, salvataggi nell'interfaccia"
```

---

### Task 9: Prova a occhio di una partita — *inline*

Nessun file nuovo: è una verifica, e quello che si trova diventa un task di correzione con il suo test.

- [ ] **Step 1: Partita veloce in headless con screenshot**

Con uno script usa e getta nello scratchpad (playwright-core del progetto, `startServer(0)`), scegli i **Volsci**, avvia, porta la velocità a 5, togli la pausa per 20 secondi, fai screenshot a 0, 10 e 20 secondi con la modalità politica e uno con la modalità relazioni. Guarda gli screenshot con il Read tool.

Controlla: occupazioni a righe visibili, etichette degli eserciti leggibili, notizie in basso a sinistra, nessun testo che esce dai pannelli, barra in alto su una riga a 1400 px.

- [ ] **Step 2: Riporta**

Per ogni difetto visivo: scrivi un controllo nella prova di fumo che lo riproduca (se è verificabile dal DOM), correggi, rilancia `npm run smoke` e `npm test`, commit `fix: ...`. I difetti solo estetici e non verificabili dal DOM vanno nel registro come `minor (deferred)`.

---

## Tappe successive

3. Jev: proxy in `server.js`, `questions.js`, coda asincrona, pannello Consiglio, bench misto.
4. Diplomazia, governo e slider (con la stabilità nel dado di battaglia), cultura e rivolte.
5. Eventi e popoli dormienti.
6. Taratura della difficoltà con il bench.
