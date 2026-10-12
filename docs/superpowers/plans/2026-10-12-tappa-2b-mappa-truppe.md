# Universalis Romae — Tappa 2b: mappa realistica e truppe animate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mappa con rilievo vero in stile carta antica (seppia, fiumi e laghi, confini irregolari) e soldatini animati che camminano lungo i percorsi, con selezione singola, multipla e a rettangolo, unisci e dividi.

**Architecture:** Tre script di generazione (`build-map.js` esteso, nuovo `build-relief.js`) producono `map.json` con fiumi, laghi e confini condivisi e `img/rilievo.jpg`. Il renderer diventa a due strati: una base in cache (mare, rilievo, velature, confini, acque, nomi) e uno strato eserciti ridisegnato a ogni fotogramma. La posizione e il percorso dei soldatini si calcolano in funzioni pure (`armies-view.js`); la figura è vettoriale (`soldier.js`). Due comandi nuovi nella simulazione: `unisci`, `dividi`.

**Tech Stack:** come prima; dipendenze di sviluppo nuove: `pngjs@7.0.0`, `jpeg-js@0.4.4`. Dati: terrain tiles AWS `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` (elevazione = R·256 + G + B/256 − 32768), Natural Earth 10m rivers/lakes (+ supplementi Europa).

**Spec:** `docs/superpowers/specs/2026-10-12-universalis-romae-design.md`, sezione 10.

**Esecuzione:** inline.

## Global Constraints

- Il gioco carica solo file di `public/`; i dati grezzi (`data/ne/`, `data/dem/`) restano fuori dal repo.
- La simulazione resta deterministica e JSON puro; `unisci`/`dividi` passano da `applyCommand`.
- Proiezione unica, condivisa da mappa e rilievo (`tools/projection.js`).
- Confini irregolari deterministici: stessa linea per le due province vicine; le confinanze e il test "il centro di ogni provincia cade nella provincia" devono restare verdi.
- Strato base ridisegnato solo se cambiano camera, dimensioni, modalità, giocatore, evidenziazione o proprietà/controllo delle province.
- Il trascinamento semplice sposta la mappa; Maiuscolo+trascinamento seleziona col rettangolo.
- Commit alla fine di ogni task con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Un esercito selezionato che si unisce a un altro o viene distrutto: la selezione si aggiorna, niente errori (prova di fumo nel task 7).
2. Clic destro con più eserciti selezionati, alcuni senza percorso: partono quelli che possono, un solo avviso per gli altri (prova di fumo nel task 7).
3. Rilievo non ancora caricato (o file mancante): la mappa si disegna lo stesso e si aggiorna appena l'immagine arriva (prova di fumo nel task 6).
4. Gioco in pausa o a velocità 1: i soldatini non saltano, la posizione è continua tra un giorno e l'altro (test nel task 5).
5. Confini irregolari: nessun buco o sovrapposizione tra province vicine, nessun centro fuori dalla sua provincia (test nei task 2 e 3).

## Mappa dei file

```
tools/projection.js            proiezione condivisa
tools/geo.js                   + ruvidezza dei lati, confini condivisi, simplifyLine
tools/build-map.js             + fiumi, laghi, confini, ruvidezza
tools/fetch-ne.sh              + fiumi e laghi
tools/relief-lib.js            funzioni pure per il rilievo
tools/build-relief.js          scarica il DEM e genera public/img/rilievo.jpg
public/img/rilievo.jpg         generato
public/js/sim/armies.js        + mergeArmies, splitArmy
public/js/sim/commands.js      + unisci, dividi
public/js/ui/clock.js          + frazione
public/js/ui/armies-view.js    posizione, percorso, pila, rettangolo, scala dei soldatini
public/js/ui/soldier.js        soldatino, etichetta, freccia (Canvas)
public/js/ui/renderer.js       riscritto a due strati
public/js/ui/input.js          + Maiuscolo, rettangolo
public/js/ui/views.js          + selectionActions, armiesView con selezione
public/js/ui/panels.js         esercitiHtml con unisci/dividi
public/js/main.js, index.html  selezione multipla, niente modalità terreno
```

---

### Task 1: Unisci e dividi nella simulazione — *inline*

**Files:**
- Modify: `public/js/sim/armies.js`, `public/js/sim/commands.js`
- Test: `test/armies.test.js` (aggiunte)

**Interfaces:**
- Produces: `mergeArmies(game, nationId, ids) → { ok, motivo?, esercito? }`, `splitArmy(game, nationId, id) → { ok, motivo?, esercito? }`; comandi `{ tipo: 'unisci', nazione, eserciti: [id] }`, `{ tipo: 'dividi', nazione, esercito }`.

- [ ] **Step 1: Scrivi i test che falliscono**

In `test/armies.test.js` aggiungi `createArmy` all'import da `state.js`, `mergeArmies, splitArmy` all'import da `armies.js`, e in fondo:

```js
test('unisci: stessi uomini, morale medio pesato, un solo esercito', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  const b = createArmy(g, 'roma', 'a', 1000, 100);
  r.morale = 3; b.morale = 1;
  const tot = r.fanteria + r.cavalleria + 1100;
  const res = mergeArmies(g, 'roma', [r.id, b.id]);
  assert.deepEqual(res, { ok: true, esercito: r.id });
  assert.equal(armiesOf(g, 'roma').length, 1);
  assert.equal(r.fanteria + r.cavalleria, tot);
  assert.ok(Math.abs(r.morale - (3 * (tot - 1100) + 1 * 1100) / tot) < 1e-9);
});

test('unisci: rifiuti', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  const b = createArmy(g, 'roma', 'b', 1000, 0);
  const [v] = armiesOf(g, 'volsci');
  assert.equal(mergeArmies(g, 'roma', [r.id]).motivo, 'servono almeno due eserciti');
  assert.equal(mergeArmies(g, 'roma', [r.id, b.id]).motivo, 'non sono nella stessa provincia');
  assert.equal(mergeArmies(g, 'roma', [r.id, v.id]).motivo, 'esercito non tuo');
  b.prov = 'a'; b.percorso = ['b'];
  assert.equal(mergeArmies(g, 'roma', [r.id, b.id]).motivo, 'eserciti in marcia o in battaglia');
});

test('dividi: due metà con lo stesso morale; troppo piccolo no', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  r.morale = 2;
  const res = splitArmy(g, 'roma', r.id);
  assert.equal(res.ok, true);
  const n = g.eserciti[res.esercito];
  assert.deepEqual([r.fanteria, n.fanteria, r.cavalleria, n.cavalleria], [1170, 1170, 117, 117]);
  assert.equal(n.morale, 2);
  assert.equal(n.prov, r.prov);
  const p = createArmy(g, 'roma', 'b', 150, 0);
  assert.equal(splitArmy(g, 'roma', p.id).motivo, 'esercito troppo piccolo');
  assert.equal(applyCommand(g, { tipo: 'dividi', nazione: 'roma', esercito: r.id }).ok, true);
  assert.equal(applyCommand(g, { tipo: 'unisci', nazione: 'roma', eserciti: [r.id, res.esercito] }).ok, true);
});
```

E aggiungi in testa `import { applyCommand } from '../public/js/sim/commands.js';`.

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL, `does not provide an export named 'mergeArmies'`.

- [ ] **Step 3: Implementa**

In fondo a `public/js/sim/armies.js`:

```js
export function mergeArmies(game, nationId, ids) {
  if (!Array.isArray(ids) || ids.length < 2 || new Set(ids).size !== ids.length) return { ok: false, motivo: 'servono almeno due eserciti' };
  const armies = ids.map(id => game.eserciti[id]);
  if (armies.some(a => !a || a.owner !== nationId)) return { ok: false, motivo: 'esercito non tuo' };
  if (armies.some(a => a.prov !== armies[0].prov)) return { ok: false, motivo: 'non sono nella stessa provincia' };
  if (armies.some(a => a.inBattaglia || a.percorso.length)) return { ok: false, motivo: 'eserciti in marcia o in battaglia' };
  const men = a => a.fanteria + a.cavalleria;
  const tot = armies.reduce((s, a) => s + men(a), 0);
  const [first, ...rest] = armies;
  if (tot > 0) first.morale = armies.reduce((s, a) => s + a.morale * men(a), 0) / tot;
  for (const a of rest) {
    first.fanteria += a.fanteria;
    first.cavalleria += a.cavalleria;
    delete game.eserciti[a.id];
  }
  return { ok: true, esercito: first.id };
}

export function splitArmy(game, nationId, id) {
  const a = game.eserciti[id];
  if (!a || a.owner !== nationId) return { ok: false, motivo: 'esercito non tuo' };
  if (a.inBattaglia) return { ok: false, motivo: 'esercito in battaglia' };
  const fanti = Math.floor(a.fanteria / 2), cavalieri = Math.floor(a.cavalleria / 2);
  const min = game.balance.combattimento.minimoUomini;
  if (fanti + cavalieri < min || a.fanteria - fanti + a.cavalleria - cavalieri < min) return { ok: false, motivo: 'esercito troppo piccolo' };
  a.fanteria -= fanti;
  a.cavalleria -= cavalieri;
  const b = createArmy(game, nationId, a.prov, fanti, cavalieri);
  b.morale = a.morale;
  return { ok: true, esercito: b.id };
}
```

In `public/js/sim/commands.js`, importa `mergeArmies, splitArmy` da `./armies.js` e aggiungi prima di `default`:

```js
    case 'unisci':
      return mergeArmies(game, cmd.nazione, cmd.eserciti);
    case 'dividi':
      return splitArmy(game, cmd.nazione, cmd.esercito);
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 133 test.

- [ ] **Step 5: Commit**

```bash
git add public/js/sim/armies.js public/js/sim/commands.js test/armies.test.js
git commit -m "feat: unisci e dividi gli eserciti"
```

---

### Task 2: Lati irregolari e confini condivisi — *inline*

**Files:**
- Modify: `tools/geo.js`
- Test: `test/geo.test.js` (aggiunte)

**Interfaces:**
- Produces:
  - `roughEdge(a, b, ampiezza, livelli = 3) → [[x, y], ...]` (da `a` a `b` inclusi): deterministica; `roughEdge(b, a)` è la stessa linea al contrario; ogni punto dista dal segmento al massimo `ampiezza · |ab|`.
  - `roughenRing(ring, ampiezza, bbox) → ring` (non tocca i lati sul bordo del riquadro `bbox = [x0, y0, x1, y1]`).
  - `buildProvinces({ pieces, centers, width, height, ruvidezza = 0 })`: con `ruvidezza > 0` le celle di Voronoi passano da `roughenRing` prima del taglio sulla terra.
  - `sharedBorder(multiA, multiB, tol) → [polilinea]`: tratti comuni di almeno due vertici.
  - `simplifyLine(points, tol)` (Ramer-Douglas-Peucker su una linea aperta; è `rdp` esportata).

- [ ] **Step 1: Scrivi i test che falliscono**

In `test/geo.test.js` aggiungi agli import `roughEdge, roughenRing, sharedBorder, simplifyLine` e in fondo:

```js
const distSeg = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};

test('lato irregolare: deterministico, uguale al contrario, vicino al segmento', () => {
  const a = [10, 20], b = [90, 35];
  const l1 = roughEdge(a, b, 0.12), l2 = roughEdge(b, a, 0.12);
  assert.equal(l1.length, 9);
  assert.deepEqual(l1, roughEdge(a, b, 0.12));
  assert.deepEqual(l2, [...l1].reverse());
  assert.deepEqual([l1[0], l1.at(-1)], [a, b]);
  const len = Math.hypot(80, 15);
  assert.ok(l1.every(p => distSeg(p, a, b) <= 0.12 * len + 1e-9));
  assert.ok(l1.some(p => distSeg(p, a, b) > 0.5)); // non è dritto
});

test('anello irregolare: i lati sul bordo del riquadro restano dritti', () => {
  const ring = [[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]];
  const r = roughenRing(ring, 0.12, [0, 0, 100, 100]);
  assert.deepEqual(r.slice(0, 2), [[0, 0], [50, 0]]); // lato sul bordo y = 0: dritto
  assert.deepEqual(r.at(-2), [0, 50]); // lato sul bordo x = 0: dritto
  assert.ok(r.length > ring.length); // gli altri due lati sono spezzati
  assert.deepEqual(r[0], r.at(-1));
});

test('province con lati irregolari: coprono la terra senza buchi, confinanze invariate', () => {
  const centers = [
    { id: 'no', x: 25, y: 25 }, { id: 'ne', x: 75, y: 25 },
    { id: 'so', x: 25, y: 75 }, { id: 'se', x: 75, y: 75 }
  ];
  const cells = buildProvinces({ pieces: [[square]], centers, width: 100, height: 100, ruvidezza: 0.12 });
  const area = cells.reduce((s, c) => s + c.poligoni.reduce((t, poly) => t + Math.abs(ringArea(poly[0])), 0), 0);
  assert.ok(Math.abs(area - 10000) < 1e-6, `area ${area}`);
  assert.ok(cells.some(c => Math.abs(c.poligoni.reduce((t, poly) => t + Math.abs(ringArea(poly[0])), 0) - 2500) > 1));
  const adj = buildAdjacency(cells, { collegamenti: [], tagli: [] });
  assert.deepEqual(adj.no, ['ne', 'so']);
  assert.deepEqual(adj.se, ['ne', 'so']);
});

test('confine condiviso: il tratto comune, niente per i soli angoli', () => {
  const a = [[[0, 0], [50, 0], [50, 25], [50, 50], [0, 50], [0, 0]]];
  const b = [[[50, 0], [100, 0], [100, 50], [50, 50], [50, 25], [50, 0]]];
  const c = [[[50, 50], [100, 50], [100, 100], [50, 100], [50, 50]]];
  const [linea] = sharedBorder([a], [b], 0.5);
  assert.deepEqual([...linea].sort(), [[50, 0], [50, 25], [50, 50]].sort());
  assert.deepEqual(sharedBorder([a], [c], 0.5), []);
});

test('semplificazione di una linea aperta', () => {
  assert.deepEqual(simplifyLine([[0, 0], [5, 0.1], [10, 0], [10, 10]], 0.5), [[0, 0], [10, 0], [10, 10]]);
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL, `does not provide an export named 'roughEdge'`.

- [ ] **Step 3: Implementa in `tools/geo.js`**

Rinomina `function rdp(points, tol)` in `export function simplifyLine(points, tol)` e aggiorna le sue chiamate (dentro sé stessa e in `simplifyRing`).

Aggiungi dopo `simplifyLine`:

```js
// Pseudo-caso deterministico in [-1, 1] da due numeri: lo stesso lato dà sempre la stessa linea.
function hash2(x, y, k) {
  let h = Math.imul(Math.round(x * 100) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(y * 100) + k, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

// Lato spezzato con spostamenti del punto medio; costruito sempre dall'estremo "minore",
// così le due province vicine ricevono la stessa linea.
export function roughEdge(a, b, ampiezza, livelli = 3) {
  const swap = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const [p, q] = swap ? [b, a] : [a, b];
  let pts = [p, q];
  let amp = ampiezza * 0.5;
  for (let l = 0; l < livelli; l++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const off = hash2(mx, my, l) * amp * Math.hypot(q[0] - p[0], q[1] - p[1]) / 2 ** l;
      next.push(len ? [mx - (dy / len) * off, my + (dx / len) * off] : [mx, my], pts[i + 1]);
    }
    pts = next;
    amp *= 0.5;
  }
  return swap ? pts.reverse() : pts;
}

export function roughenRing(ring, ampiezza, [x0, y0, x1, y1]) {
  const onBorder = (a, b) => (a[0] === x0 && b[0] === x0) || (a[0] === x1 && b[0] === x1) ||
    (a[1] === y0 && b[1] === y0) || (a[1] === y1 && b[1] === y1);
  const out = [ring[0]];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    out.push(...(onBorder(a, b) ? [b] : roughEdge(a, b, ampiezza).slice(1)));
  }
  return out;
}

// Tratti comuni di due multipoligoni: vertici di A che stanno anche in B, in sequenze di almeno due.
export function sharedBorder(multiA, multiB, tol) {
  const ptsB = multiB.flatMap(poly => poly.flatMap(r => r));
  const inB = p => ptsB.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol);
  const lines = [];
  for (const poly of multiA) for (const ring of poly) {
    const open = ring.slice(0, -1);
    const m = open.map(inB);
    if (m.every(Boolean) || !m.some(Boolean)) continue;
    const start = m.indexOf(false); // si parte da un vertice non condiviso, così le sequenze non si spezzano a cavallo
    let run = [];
    for (let k = 1; k <= open.length; k++) {
      const i = (start + k) % open.length;
      if (m[i]) run.push(open[i]);
      else { if (run.length >= 2) lines.push(run); run = []; }
    }
    if (run.length >= 2) lines.push(run);
  }
  return lines;
}
```

In `buildProvinces`, cambia la firma in `export function buildProvinces({ pieces, centers, width, height, ruvidezza = 0 })` e la riga dell'intersezione in:

```js
      const cella = voronoi.cellPolygon(k);
      const forma = ruvidezza > 0 ? roughenRing(cella, ruvidezza, [0, 0, width, height]) : cella;
      const poligoni = polygonClipping.intersection([forma], piece);
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 138 test.

- [ ] **Step 5: Commit**

```bash
git add tools/geo.js test/geo.test.js
git commit -m "feat: lati irregolari e confini condivisi per la mappa"
```

---

### Task 3: Fiumi, laghi, confini irregolari nella mappa reale — *inline*

**Files:**
- Create: `tools/projection.js`
- Modify: `tools/build-map.js`, `tools/fetch-ne.sh`, `public/data/map.json` (rigenerato)
- Test: `test/map.test.js` (aggiunte)

**Interfaces:**
- Produces:
  - `tools/projection.js`: `W = 1000`, `H = 1200`, `makeProjection(anello) → d3 projection` (stessa di prima).
  - `map.json` in più: `fiumi: [{ nome, rank, punti: [[x, y]] }]`, `laghi: [poligono]`, `confini: [{ a, b, punti: [[x, y]] }]` (uno per tratto condiviso fra province vicine).

- [ ] **Step 1: Scrivi i test che falliscono**

In fondo a `test/map.test.js`:

```js
const distPunto = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

test('fiumi e laghi: il Tevere passa da Roma, laghi a nord', () => {
  assert.ok(map.fiumi.length >= 20);
  assert.ok(map.fiumi.some(f => f.punti.some(p => distPunto(p, byId.roma.centro) < 20)), 'nessun fiume vicino a Roma');
  assert.ok(map.laghi.length >= 3);
  assert.ok(map.laghi.some(l => l[0].every(([, y]) => y < 350)), 'nessun lago al nord');
});

test('confini condivisi: uno o più tratti per ogni coppia di vicini sulla stessa terra', () => {
  const coppie = new Set(map.confini.map(c => [c.a, c.b].sort().join('|')));
  for (const p of map.province) for (const v of p.vicini) {
    if (map.stretti.some(([x, y]) => [x, y].sort().join('|') === [p.id, v].sort().join('|'))) continue;
    assert.ok(coppie.has([p.id, v].sort().join('|')), `${p.id}-${v} senza confine`);
  }
  assert.ok(map.confini.every(c => c.punti.length >= 2));
});

test('confini irregolari: le linee fra province non sono più segmenti dritti', () => {
  assert.ok(map.confini.some(c => c.punti.length > 4));
});
```

- [ ] **Step 2: Verifica che falliscano**

Run: `npm test`
Expected: FAIL (`map.fiumi` undefined).

- [ ] **Step 3: Scarica i dati**

Aggiungi in fondo a `tools/fetch-ne.sh`:

```sh
for f in ne_10m_rivers_lake_centerlines ne_10m_rivers_europe ne_10m_lakes ne_10m_lakes_europe; do
  curl -fL -o "data/ne/$f.geojson" \
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/$f.geojson"
done
```

Run: `npm run fetch-ne`
Expected: cinque file in `data/ne/`.

- [ ] **Step 4: Estrai la proiezione in `tools/projection.js`**

```js
// Proiezione unica della mappa (conica conforme centrata sull'Italia), condivisa da mappa e rilievo.
import { geoConicConformal } from 'd3-geo';

export const W = 1000, H = 1200;

// Si inquadra sui vertici dell'anello come punti: polygon-clipping produce anelli antiorari,
// che d3-geo leggerebbe come "tutto il globo tranne l'Italia".
export function makeProjection(anello) {
  return geoConicConformal().parallels([38, 46]).rotate([-12.5, 0])
    .fitExtent([[20, 20], [W - 20, H - 20]], { type: 'MultiPoint', coordinates: anello });
}
```

- [ ] **Step 5: Estendi `tools/build-map.js`**

- Sostituisci l'import di `geoConicConformal`, la costante `W, H` e la costruzione di `projection` con:

```js
import { makeProjection, W, H } from './projection.js';
```

```js
const TOL = 0.6, RUVIDEZZA = 0.12;
```

```js
const projection = makeProjection(anello);
```

- Importa da `./geo.js` anche `sharedBorder` e `simplifyLine`.
- Nella chiamata a `buildProvinces` aggiungi `ruvidezza: RUVIDEZZA`.
- Prima di costruire `map`, aggiungi:

```js
// Fiumi e laghi veri: si tengono i tratti dentro l'anello, proiettati e semplificati.
const fiumiGeo = ['ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe'].flatMap(f => read(`data/ne/${f}.geojson`).features);
const dentro = ([lon, lat]) => pointInRing([lon, lat], anello);
const fiumi = [];
for (const f of fiumiGeo) {
  if (!f.geometry) continue;
  const linee = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
  for (const linea of linee) {
    let tratto = [];
    const chiudi = () => {
      if (tratto.length >= 2) {
        const punti = simplifyLine(tratto.map(proj), 0.4);
        if (punti.length >= 2) fiumi.push({ nome: f.properties.name ?? '', rank: f.properties.scalerank ?? 10, punti });
      }
      tratto = [];
    };
    for (const p of linea) { if (dentro(p)) tratto.push(p); else chiudi(); }
    chiudi();
  }
}
const laghi = ['ne_10m_lakes', 'ne_10m_lakes_europe']
  .flatMap(f => read(`data/ne/${f}.geojson`).features)
  .filter(f => f.geometry)
  .flatMap(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates))
  .filter(poly => dentro(poly[0][0]))
  .map(poly => poly.map(ring => simplifyRing(ring.map(proj), 0.4)))
  .filter(poly => poly[0].length >= 4 && Math.abs(ringArea(poly[0])) > 2);

// Confini condivisi fra province vicine (non gli stretti), per disegnarli a parte.
const confini = [];
cells.forEach((c, i) => {
  for (const v of vicini[c.id]) {
    const j = cells.findIndex(d => d.id === v);
    if (j <= i || c.piece !== cells[j].piece) continue;
    for (const punti of sharedBorder(c.poligoni, cells[j].poligoni, 0.5)) confini.push({ a: c.id, b: v, punti: round([[punti]])[0][0] });
  }
});
```

- Aggiungi `fiumi, laghi, confini` all'oggetto `map` dopo `decorazioni`.
- Nella riga finale `console.log` aggiungi `fiumi: ${fiumi.length}, laghi: ${laghi.length}, confini: ${confini.length}`.

- [ ] **Step 6: Rigenera e verifica**

Run: `npm run build-map`
Expected: `province: 149, ... isolate: nessuna, fiumi: N, laghi: M, confini: K` con N ≥ 20.

Run: `npm test`
Expected: PASS, 141 test. Se il test "il centro di ogni provincia cade nella provincia" fallisce per qualche provincia, riduci `RUVIDEZZA` a 0.08 e rigenera (annota un `Ruling:`); non spostare i centri.

Controllo visivo: con lo script `map2svg.mjs` dello scratchpad (o una sua copia che disegni anche `fiumi` e `laghi`), guarda la mappa: confini ondulati ma senza buchi, Tevere da Roma al mare, Po, laghi alpini.

- [ ] **Step 7: Commit**

```bash
git add tools/projection.js tools/build-map.js tools/fetch-ne.sh public/data/map.json test/map.test.js
git commit -m "feat: fiumi, laghi e confini irregolari nella mappa"
```

---

### Task 4: Rilievo seppia da elevazione vera — *inline*

**Files:**
- Create: `tools/relief-lib.js`, `tools/build-relief.js`, `public/img/rilievo.jpg` (generato)
- Modify: `package.json` (devDependencies `pngjs@7.0.0`, `jpeg-js@0.4.4`; script `build-relief`), `.gitignore` (`data/dem/` già aggiunto)
- Test: `test/relief.test.js`

**Interfaces:**
- Produces (`tools/relief-lib.js`, puro):
  - `lonLatToPixel(lon, lat, z) → [x, y]` (pixel Web Mercator a zoom `z`, tasselli da 256).
  - `decodeTerrarium(r, g, b) → metri`.
  - `hillshade(dz_dx, dz_dy, azimutGradi = 315, altezzaGradi = 45) → 0..1`.
  - `sepia(quota, luce) → [r, g, b]` (0..255).
- `npm run build-relief` → `public/img/rilievo.jpg` 3000×3600, mondo 1000×1200 scalato ×3.

- [ ] **Step 1: Installa le dipendenze e scrivi il test che fallisce**

Run: `npm install --save-dev --save-exact pngjs@7.0.0 jpeg-js@0.4.4`

Aggiungi a `scripts` in `package.json`: `"build-relief": "node tools/build-relief.js"`.

`test/relief.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lonLatToPixel, decodeTerrarium, hillshade, sepia } from '../tools/relief-lib.js';

test('pixel Web Mercator', () => {
  assert.deepEqual(lonLatToPixel(0, 0, 0), [128, 128]);
  const [x, y] = lonLatToPixel(12.5, 41.9, 8);
  assert.equal(Math.floor(x / 256), 136);
  assert.equal(Math.floor(y / 256), 95);
});

test('decodifica terrarium', () => {
  assert.equal(decodeTerrarium(128, 0, 0), 0);
  assert.equal(decodeTerrarium(130, 15, 128), 2 * 256 + 15 + 0.5);
});

test('ombreggiatura: piano a metà, versante esposto alla luce più chiaro di quello in ombra', () => {
  const piano = hillshade(0, 0);
  assert.ok(Math.abs(piano - Math.sin(Math.PI / 4)) < 1e-9);
  // luce da nord-ovest: un versante che sale verso sud-est guarda a nord-ovest ed è illuminato
  assert.ok(hillshade(1, 1) > hillshade(-1, -1));
  assert.ok(hillshade(5, 5) >= 0 && hillshade(-5, -5) <= 1);
});

test('tavolozza seppia: pianura chiara, montagna più scura, vette quasi bianche, luce che scurisce', () => {
  const pianura = sepia(50, 0.7), monte = sepia(1500, 0.7), vetta = sepia(3500, 0.7);
  const lum = ([r, g, b]) => r + g + b;
  assert.ok(lum(pianura) > lum(monte));
  assert.ok(lum(vetta) > lum(monte));
  assert.ok(lum(sepia(1500, 0.3)) < lum(sepia(1500, 0.9)));
  assert.ok(sepia(800, 0.6).every(c => Number.isInteger(c) && c >= 0 && c <= 255));
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `npm test`
Expected: FAIL, `Cannot find module '.../tools/relief-lib.js'`.

- [ ] **Step 3: Implementa `tools/relief-lib.js`**

```js
// Funzioni pure per il rilievo: tasselli di elevazione, ombreggiatura, tavolozza da carta antica.
export function lonLatToPixel(lon, lat, z) {
  const n = 256 * 2 ** z;
  const r = lat * Math.PI / 180;
  return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n];
}

export function decodeTerrarium(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

// Ombreggiatura classica (luce da azimut e altezza dati); dz_dx verso est, dz_dy verso sud, in unità di quota/distanza.
export function hillshade(dzdx, dzdy, azimutGradi = 315, altezzaGradi = 45) {
  const zen = (90 - altezzaGradi) * Math.PI / 180;
  const az = (360 - azimutGradi + 90) * Math.PI / 180;
  const slope = Math.atan(Math.hypot(dzdx, dzdy));
  const aspect = Math.atan2(dzdy, -dzdx);
  const v = Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(az - aspect);
  return Math.max(0, Math.min(1, v));
}

const STOPS = [ // quota in metri → colore carta antica
  [0, [236, 224, 196]], [300, [228, 211, 176]], [800, [214, 190, 148]],
  [1600, [196, 166, 122]], [2400, [222, 210, 190]], [3200, [244, 240, 232]]
];

export function sepia(quota, luce) {
  let i = 0;
  while (i < STOPS.length - 2 && quota > STOPS[i + 1][0]) i++;
  const [q0, c0] = STOPS[i], [q1, c1] = STOPS[i + 1];
  const t = Math.max(0, Math.min(1, (quota - q0) / (q1 - q0)));
  const f = 0.55 + 0.6 * luce; // la luce scurisce o schiarisce il colore di base
  return c0.map((c, k) => Math.max(0, Math.min(255, Math.round((c + (c1[k] - c) * t) * f))));
}
```

Nota su `hillshade(0, 0)`: con pendenza nulla resta `cos(zen) = sin(45°)`.

- [ ] **Step 4: Verifica che i test passino**

Run: `npm test`
Expected: PASS, 145 test.

- [ ] **Step 5: Implementa `tools/build-relief.js`**

```js
// Genera public/img/rilievo.jpg: elevazione vera (terrain tiles AWS, zoom 8), ombreggiata e colorata in seppia,
// nella stessa proiezione della mappa. I tasselli restano in cache in data/dem/.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { makeProjection, W, H } from './projection.js';
import { lonLatToPixel, decodeTerrarium, hillshade, sepia } from './relief-lib.js';

const Z = 8, SCALA = 3, ESAGERAZIONE = 2.5;
const { anello } = JSON.parse(readFileSync(new URL('../data/confine.json', import.meta.url)));
const projection = makeProjection(anello);

const lons = anello.map(p => p[0]), lats = anello.map(p => p[1]);
const [x0, y0] = lonLatToPixel(Math.min(...lons) - 0.5, Math.max(...lats) + 0.5, Z).map(v => Math.floor(v / 256));
const [x1, y1] = lonLatToPixel(Math.max(...lons) + 0.5, Math.min(...lats) - 0.5, Z).map(v => Math.floor(v / 256));
const TW = x1 - x0 + 1, TH = y1 - y0 + 1;
console.log(`tasselli: ${TW}×${TH}`);

const dem = new Float32Array(TW * 256 * TH * 256);
for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
  const file = new URL(`../data/dem/${Z}/${tx}/${ty}.png`, import.meta.url);
  if (!existsSync(file)) {
    mkdirSync(new URL(`../data/dem/${Z}/${tx}/`, import.meta.url), { recursive: true });
    const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`);
    if (!r.ok) throw new Error(`tassello ${tx}/${ty}: ${r.status}`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const png = PNG.sync.read(readFileSync(file));
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    dem[((ty - y0) * 256 + y) * TW * 256 + (tx - x0) * 256 + x] = Math.max(0, decodeTerrarium(png.data[i], png.data[i + 1], png.data[i + 2]));
  }
}

function quota(lon, lat) {
  const [px, py] = lonLatToPixel(lon, lat, Z);
  const x = px - x0 * 256, y = py - y0 * 256;
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = TW * 256, h = TH * 256;
  if (xi < 0 || yi < 0 || xi + 1 >= w || yi + 1 >= h) return 0;
  const a = dem[yi * w + xi], b = dem[yi * w + xi + 1], c = dem[(yi + 1) * w + xi], d = dem[(yi + 1) * w + xi + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

const OW = W * SCALA, OH = H * SCALA;
const q = new Float32Array(OW * OH);
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  const ll = projection.invert([(x + 0.5) / SCALA, (y + 0.5) / SCALA]);
  q[y * OW + x] = ll ? quota(ll[0], ll[1]) : 0;
}

// metri per pixel d'uscita, misurati al centro della mappa
const c = projection.invert([W / 2, H / 2]), c2 = projection.invert([W / 2 + 1 / SCALA, H / 2]);
const metri = (c2[0] - c[0]) * 111320 * Math.cos(c[1] * Math.PI / 180);
console.log(`${metri.toFixed(0)} m per pixel`);

const out = Buffer.alloc(OW * OH * 4);
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  const at = (xx, yy) => q[Math.min(OH - 1, Math.max(0, yy)) * OW + Math.min(OW - 1, Math.max(0, xx))];
  const dzdx = (at(x + 1, y) - at(x - 1, y)) / (2 * metri) * ESAGERAZIONE;
  const dzdy = (at(x, y + 1) - at(x, y - 1)) / (2 * metri) * ESAGERAZIONE;
  const [r, g, b] = sepia(q[y * OW + x], hillshade(dzdx, dzdy));
  const i = (y * OW + x) * 4;
  out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
}
mkdirSync(new URL('../public/img/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/img/rilievo.jpg', import.meta.url), jpeg.encode({ data: out, width: OW, height: OH }, 82).data);
console.log(`rilievo: ${OW}×${OH}`);
```

- [ ] **Step 6: Genera e guarda**

Run: `npm run build-relief`
Expected: `tasselli: N×M`, metri per pixel tra 250 e 450, `rilievo: 3000×3600`, nessun errore; file `public/img/rilievo.jpg` tra 1 e 6 MB.

Guarda l'immagine ridotta (`sips -Z 1000` nello scratchpad, poi Read): Alpi e Appennini riconoscibili, luce da nord-ovest, toni seppia, Etna e Vesuvio visibili. Se il rilievo è troppo piatto o troppo scuro, regola `ESAGERAZIONE` (1,5–4) o il fattore della luce in `sepia`, aggiorna i test se cambia la tavolozza, e annota un `Ruling:`.

- [ ] **Step 7: Commit**

```bash
git add tools/relief-lib.js tools/build-relief.js public/img/rilievo.jpg package.json package-lock.json test/relief.test.js
git commit -m "feat: rilievo seppia da elevazione vera"
```

---

### Task 5: Posizioni e percorsi dei soldatini — *inline*

**Files:**
- Create: `public/js/ui/armies-view.js`
- Modify: `public/js/ui/clock.js`
- Test: `test/armies-view.test.js`

**Interfaces:**
- Produces:
  - `clock.js`: `frazione(clock) → 0..1` (frazione del giorno in corso; 0 in pausa).
  - `armies-view.js`:
    - `armyWorldPos(game, army, centri, fraz = 0) → { x, y, dir: 1|-1, inMarcia }` (interpolata fra il centro della provincia attuale e quello della prossima).
    - `pathSteps(game, army, centri, fraz = 0) → [{ da: [x, y], a: [x, y], giorni }]` (prima tappa dalla posizione attuale con i giorni mancanti, poi una per provincia).
    - `stackOffset(i, n) → dx` (pixel schermo, ventaglio centrato, 30 px fra soldatini).
    - `armiesInRect(markers, rect, owner) → [id]` (`rect = { x0, y0, x1, y1 }` in qualsiasi ordine, `markers: [{ id, x, y, owner }]`).
    - `soldierScale(camera) → 0.8..1.4`.

- [ ] **Step 1: Scrivi il test che fallisce `test/armies-view.test.js`**

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf } from '../public/js/sim/state.js';
import { declareWar } from '../public/js/sim/war.js';
import { orderMove, advanceMovement } from '../public/js/sim/armies.js';
import { createClock, setPaused, tick, frazione } from '../public/js/ui/clock.js';
import { armyWorldPos, pathSteps, stackOffset, armiesInRect, soldierScale } from '../public/js/ui/armies-view.js';

const centri = { a: [0, 0], b: [100, 0], c: [200, 0], d: [0, 100], e: [100, 100], f: [200, 100], g: [300, 100] };

test('frazione del giorno: 0 in pausa, cresce con il tempo', () => {
  const c = createClock();
  assert.equal(frazione(c), 0);
  setPaused(c, false);
  tick(c, 0);
  tick(c, 100); // velocità 3: 200 ms al giorno
  assert.equal(frazione(c), 0.5);
});

test('posizione continua durante la marcia, direzione verso la meta', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  assert.deepEqual(armyWorldPos(g, r, centri), { x: 0, y: 0, dir: 1, inMarcia: false });
  orderMove(g, r.id, 'b'); // 10 giorni (collina)
  for (let i = 0; i < 4; i++) advanceMovement(g);
  const p = armyWorldPos(g, r, centri, 0.5);
  assert.ok(Math.abs(p.x - 45) < 1e-9 && p.y === 0 && p.inMarcia);
  // a cavallo del giorno la posizione non salta: fine del giorno 4 = inizio del giorno 5
  const fine = armyWorldPos(g, r, centri, 1).x;
  advanceMovement(g);
  assert.ok(Math.abs(armyWorldPos(g, r, centri, 0).x - fine) < 1e-9);
  r.prov = 'b'; r.percorso = ['a']; r.giorniAlProssimo = 8;
  assert.equal(armyWorldPos(g, r, centri).dir, -1);
});

test('tappe del percorso con i giorni', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  declareWar(g, 'roma', 'volsci');
  orderMove(g, r.id, 'c'); // a → b (10) → c (14)
  advanceMovement(g);
  const steps = pathSteps(g, r, centri);
  assert.deepEqual(steps.map(s => s.giorni), [9, 14]);
  assert.deepEqual(steps[1].da, [100, 0]);
  assert.deepEqual(steps[1].a, [200, 0]);
  assert.ok(Math.abs(steps[0].da[0] - 10) < 1e-9);
});

test('ventaglio, rettangolo, scala', () => {
  assert.deepEqual([0, 1, 2].map(i => stackOffset(i, 3)), [-30, 0, 30]);
  assert.equal(stackOffset(0, 1), 0);
  const m = [{ id: 'e1', x: 10, y: 10, owner: 'roma' }, { id: 'e2', x: 50, y: 50, owner: 'roma' }, { id: 'e3', x: 20, y: 20, owner: 'veio' }];
  assert.deepEqual(armiesInRect(m, { x0: 30, y0: 30, x1: 0, y1: 0 }, 'roma'), ['e1']);
  assert.deepEqual(armiesInRect(m, { x0: 0, y0: 0, x1: 60, y1: 60 }, 'roma'), ['e1', 'e2']);
  assert.equal(soldierScale({ scale: 0.5, min: 0.4 }), 0.8);
  assert.equal(soldierScale({ scale: 4, min: 0.4 }), 1.4);
});
```

Note sul test "posizione": dopo 4 giorni su 10 e mezza giornata la quota percorsa è 4,5/10, cioè x = 45. Il quinto `advanceMovement` porta i giorni mancanti da 6 a 5: la posizione a frazione 0 coincide con quella di prima a frazione 1.

- [ ] **Step 2: Verifica che fallisca**

Run: `npm test`
Expected: FAIL (`frazione` non esportata).

- [ ] **Step 3: Implementa**

In fondo a `public/js/ui/clock.js`:

```js
// Quanto del giorno in corso è già passato: serve a muovere i soldatini senza scatti.
export function frazione(clock) {
  if (clock.pausa) return 0;
  return Math.min(1, clock.accumulo / SPEEDS[clock.velocita - 1]);
}
```

`public/js/ui/armies-view.js`:

```js
// Dove si disegnano gli eserciti e i loro percorsi: funzioni pure, in coordinate della mappa o dello schermo.
import { travelDays } from '../sim/armies.js';

export function armyWorldPos(game, army, centri, fraz = 0) {
  const [x0, y0] = centri[army.prov];
  if (!army.percorso.length) return { x: x0, y: y0, dir: 1, inMarcia: false };
  const next = army.percorso[0];
  const [x1, y1] = centri[next];
  const tot = travelDays(game, army.prov, next);
  const t = Math.max(0, Math.min(1, (tot - army.giorniAlProssimo + fraz) / tot));
  return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, dir: x1 >= x0 ? 1 : -1, inMarcia: true };
}

export function pathSteps(game, army, centri, fraz = 0) {
  if (!army.percorso.length) return [];
  const p = armyWorldPos(game, army, centri, fraz);
  const steps = [{ da: [p.x, p.y], a: centri[army.percorso[0]], giorni: army.giorniAlProssimo }];
  for (let i = 1; i < army.percorso.length; i++) {
    const da = army.percorso[i - 1], a = army.percorso[i];
    steps.push({ da: centri[da], a: centri[a], giorni: travelDays(game, da, a) });
  }
  return steps;
}

export function stackOffset(i, n) {
  return (i - (n - 1) / 2) * 30;
}

export function armiesInRect(markers, { x0, y0, x1, y1 }, owner) {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  return markers.filter(m => m.owner === owner && m.x >= ax && m.x <= bx && m.y >= ay && m.y <= by).map(m => m.id);
}

// Più grandi quando si ingrandisce, entro un minimo e un massimo.
export function soldierScale(camera) {
  return Math.max(0.8, Math.min(1.4, 0.7 + (camera.scale / camera.min) * 0.07));
}
```

- [ ] **Step 4: Verifica che passino**

Run: `npm test`
Expected: PASS, 149 test.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/armies-view.js public/js/ui/clock.js test/armies-view.test.js
git commit -m "feat: posizioni interpolate e percorsi dei soldatini"
```

---

### Task 6: Renderer a due strati e soldatini — *inline*

**Files:**
- Create: `public/js/ui/soldier.js`
- Modify: `public/js/ui/renderer.js` (riscritto), `public/js/main.js` (disegno a ogni fotogramma, frazione), `public/index.html` (via la modalità terreno), `tools/smoke.mjs` (modalità, rilievo)

**Interfaces:**
- Consumes: `armies-view.js`, `frazione`, `provinceFill`, `map.json` con `fiumi`, `laghi`, `confini`, `img/rilievo.jpg`.
- Produces:
  - `soldier.js`: `drawSoldier(ctx, { x, y, colore, dir, fase, scala, scelto, inMarcia, battaglia, assedio })`, `drawLabel(ctx, x, y, uomini, morale, moraleMax, scala)`, `drawArrow(ctx, [x1, y1], [x2, y2], testo)` (coordinate schermo).
  - `renderer.js`: `createRenderer(canvas, map, { onReady })` → `{ resize, draw({ game, giocatore, modo, selezione, camera, evidenzia, fraz, now, inPausa, rettangolo }), markers() → [{ id, x, y, owner }], rilievoPronto() }`. `selezione = { provincia, eserciti: [id] }`.

- [ ] **Step 1: Aggiorna la prova di fumo (deve fallire)**

In `tools/smoke.mjs`:
- sostituisci le due righe della modalità terreno con

```js
  await page.click('[data-modo="cultura"]');
  check(await page.evaluate(() => window.universalis.ui.modo) === 'cultura', 'modalità cultura');
  check((await page.locator('[data-modo="terreno"]').count()) === 0, 'la modalità terreno non c\'è più');
```

- subito dopo, aggiungi

```js
  await page.waitForFunction(() => window.universalis.rilievoPronto(), null, { timeout: 10000 }).catch(() => {});
  check(await page.evaluate(() => window.universalis.rilievoPronto()), 'rilievo caricato e disegnato');
  check(await page.evaluate(() => window.universalis.markers().length > 30), 'un soldatino per ogni esercito');
```

Run: `npm run smoke`
Expected: FAIL su `la modalità terreno non c'è più` e `rilievo caricato`.

- [ ] **Step 2: Scrivi `public/js/ui/soldier.js`**

```js
// Soldatino vettoriale (piedi in x, y), etichetta con uomini e morale, freccia del percorso. Coordinate schermo.
const INCHIOSTRO = '#2b2118';

export function drawSoldier(ctx, { x, y, colore, dir = 1, fase = 0, scala = 1, scelto = false, inMarcia = false, battaglia = false, assedio = false }) {
  if (assedio) drawTent(ctx, x - 17 * scala * dir, y, scala);
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(30, 20, 10, 0.35)';
  ctx.beginPath(); ctx.ellipse(0, 1, 9 * scala, 3 * scala, 0, 0, Math.PI * 2); ctx.fill();
  if (scelto) {
    ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.ellipse(0, 1, 14 * scala, 5.5 * scala, 0, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.scale(scala * dir, scala);
  const passo = inMarcia ? Math.sin(fase) : 0;
  ctx.translate(0, inMarcia ? -Math.abs(Math.sin(fase)) * 1.5 : 0);
  ctx.lineCap = 'round';
  // gambe
  ctx.strokeStyle = '#3b2a1a'; ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-1.5, -9); ctx.lineTo(-2.5 + passo * 3, 0);
  ctx.moveTo(1.5, -9); ctx.lineTo(2.5 - passo * 3, 0);
  ctx.stroke();
  // lancia, che in battaglia affonda
  const affondo = battaglia ? Math.max(0, Math.sin(fase * 2)) * 4 : 0;
  ctx.strokeStyle = '#6b4a2b'; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-4 + affondo, -31); ctx.lineTo(-4 + affondo, 1); ctx.stroke();
  ctx.fillStyle = '#cfcabe';
  ctx.beginPath(); ctx.moveTo(-4 + affondo, -35); ctx.lineTo(-5.8 + affondo, -30); ctx.lineTo(-2.2 + affondo, -30); ctx.closePath(); ctx.fill();
  // tunica
  ctx.fillStyle = colore; ctx.strokeStyle = INCHIOSTRO; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(-5, -20, 10, 12, 2); ctx.fill(); ctx.stroke();
  // testa, elmo e cresta
  ctx.fillStyle = '#e2b48c';
  ctx.beginPath(); ctx.arc(0, -23.5, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#b08d3c';
  ctx.beginPath(); ctx.arc(0, -24.5, 3.9, Math.PI, 0); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = colore; ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(-3, -29); ctx.quadraticCurveTo(0, -31.5, 3, -29); ctx.stroke();
  // scudo davanti
  ctx.fillStyle = colore; ctx.strokeStyle = INCHIOSTRO; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(5, -14, 4.2, 6.2, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d8c48a';
  ctx.beginPath(); ctx.arc(5, -14, 1.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  if (battaglia) drawDust(ctx, x + 11 * scala * dir, y - 5 * scala, fase, scala);
}

function drawTent(ctx, x, y, s) {
  ctx.save();
  ctx.fillStyle = '#e8dcc0'; ctx.strokeStyle = INCHIOSTRO; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - 7 * s, y); ctx.lineTo(x, y - 11 * s); ctx.lineTo(x + 7 * s, y); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x, y - 11 * s); ctx.lineTo(x, y); ctx.stroke();
  ctx.restore();
}

function drawDust(ctx, x, y, fase, s) {
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const t = (fase * 0.7 + i / 3) % 1;
    ctx.fillStyle = `rgba(200, 180, 140, ${0.6 * (1 - t)})`;
    ctx.beginPath(); ctx.arc(x + Math.cos(i * 2.1) * 6 * t * s, y - 6 * t * s, (2 + 5 * t) * s, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

export function drawLabel(ctx, x, y, uomini, morale, moraleMax, s = 1) {
  const testo = uomini >= 1000 ? `${(uomini / 1000).toFixed(1)}k` : String(uomini);
  ctx.save();
  ctx.font = `bold ${Math.round(10 * s)}px Georgia`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(testo).width + 8;
  ctx.fillStyle = 'rgba(43, 33, 24, 0.85)';
  ctx.beginPath(); ctx.roundRect(x - w / 2, y + 4, w, 13 * s, 3); ctx.fill();
  ctx.fillStyle = '#f6eedb';
  ctx.fillText(testo, x, y + 4 + 6.5 * s);
  const q = Math.max(0, Math.min(1, morale / moraleMax));
  ctx.fillStyle = 'rgba(43, 33, 24, 0.6)'; ctx.fillRect(x - 11, y + 5 + 13 * s, 22, 3);
  ctx.fillStyle = q > 0.6 ? '#5f8f3a' : q > 0.3 ? '#c9a227' : '#b03a2e';
  ctx.fillRect(x - 11, y + 5 + 13 * s, 22 * q, 3);
  ctx.restore();
}

export function drawArrow(ctx, [x1, y1], [x2, y2], testo) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = '#8b1e1e'; ctx.fillStyle = '#8b1e1e'; ctx.lineWidth = 2.5;
  ctx.setLineDash([7, 4]);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(ang) * 8, y2 - Math.sin(ang) * 8); ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(ang - 0.45) * 11, y2 - Math.sin(ang - 0.45) * 11);
  ctx.lineTo(x2 - Math.cos(ang + 0.45) * 11, y2 - Math.sin(ang + 0.45) * 11);
  ctx.closePath(); ctx.fill();
  if (testo) {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    ctx.font = 'bold 11px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(testo).width + 8;
    ctx.fillStyle = '#f6eedb'; ctx.strokeStyle = '#8b1e1e'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.roundRect(mx - w / 2, my - 8, w, 16, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#8b1e1e'; ctx.fillText(testo, mx, my);
  }
  ctx.restore();
}
```

- [ ] **Step 3: Riscrivi `public/js/ui/renderer.js`**

```js
// Disegno della mappa a due strati. La base (mare, rilievo, popoli, confini, acque, nomi) sta in una tela nascosta
// e si ridisegna solo quando cambiano vista o confini; selezione, percorsi e soldatini a ogni fotogramma.
import { provinceFill } from './colors.js';
import { toScreen } from './camera.js';
import { drawSoldier, drawLabel, drawArrow } from './soldier.js';
import { armyWorldPos, pathSteps, stackOffset, soldierScale } from './armies-view.js';

const MARE = '#cddcd8', TERRA = '#efe3c8', INCHIOSTRO = '#3b2a1a', ACQUA = '#3d6e9e';

function toPath(multi) {
  const path = new Path2D();
  for (const poly of multi) for (const ring of poly) {
    ring.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
  }
  return path;
}

function linePath(punti) {
  const path = new Path2D();
  punti.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  return path;
}

export function createRenderer(canvas, map, { onReady } = {}) {
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  const bctx = base.getContext('2d');
  const paths = Object.fromEntries(map.province.map(p => [p.id, toPath(p.poligoni)]));
  const centri = Object.fromEntries(map.province.map(p => [p.id, p.centro]));
  const decor = map.decorazioni.map(d => ({ tipo: d.tipo, path: toPath(d.poligoni) }));
  const terra = new Path2D();
  for (const p of map.province) terra.addPath(paths[p.id]);
  for (const d of decor) terra.addPath(d.path);
  const fiumi = (map.fiumi ?? []).map(f => ({ rank: f.rank, path: linePath(f.punti) }));
  const laghi = (map.laghi ?? []).map(l => toPath([l]));
  const confini = (map.confini ?? []).map(c => ({ a: c.a, b: c.b, path: linePath(c.punti) }));
  const stripes = {};
  let size = { w: 0, h: 0 }, chiaveBase = null, markers = [], pronto = false;

  const rilievo = new Image();
  rilievo.onload = () => { pronto = true; chiaveBase = null; onReady?.(); };
  rilievo.src = 'img/rilievo.jpg';

  function stripe(color) {
    if (stripes[color]) return stripes[color];
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d');
    g.strokeStyle = color; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
    return (stripes[color] = bctx.createPattern(c, 'repeat'));
  }

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = base.width = Math.round(r.width * dpr);
    canvas.height = base.height = Math.round(r.height * dpr);
    size = { w: r.width, h: r.height };
    chiaveBase = null;
    return size;
  }

  function drawBase(game, giocatore, modo, camera, evidenzia) {
    const g = bctx, dpr = window.devicePixelRatio || 1, lw = 1 / camera.scale;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = MARE;
    g.fillRect(0, 0, size.w, size.h);
    g.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.x, dpr * camera.y);
    // linee di costa ripetute sul mare, come nelle carte incise
    g.strokeStyle = 'rgba(59, 42, 26, 0.10)';
    for (const w of [26, 18, 11, 5]) { g.lineWidth = w * lw; g.stroke(terra); }
    g.fillStyle = TERRA;
    g.fill(terra);
    if (pronto) { g.save(); g.clip(terra); g.drawImage(rilievo, 0, 0, map.width, map.height); g.restore(); }
    for (const d of decor) if (d.tipo === 'incognita') { g.fillStyle = 'rgba(120, 110, 95, 0.45)'; g.fill(d.path); }
    const provs = Object.values(game.province);
    g.globalAlpha = 0.42;
    for (const p of provs) { g.fillStyle = provinceFill(game, p, modo, giocatore); g.fill(paths[p.id]); }
    g.globalAlpha = 0.8;
    for (const p of provs) if (p.controller !== p.owner) { g.fillStyle = stripe(game.nazioni[p.controller].colore); g.fill(paths[p.id]); }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(59, 42, 26, 0.45)'; g.lineWidth = 0.6 * lw; g.setLineDash([3 * lw, 2 * lw]);
    for (const c of confini) if (game.province[c.a].owner === game.province[c.b].owner) g.stroke(c.path);
    g.setLineDash([]);
    g.strokeStyle = 'rgba(43, 28, 15, 0.85)'; g.lineWidth = 1.8 * lw; g.lineJoin = 'round';
    for (const c of confini) if (game.province[c.a].owner !== game.province[c.b].owner) g.stroke(c.path);
    g.fillStyle = '#b9d0d6'; g.strokeStyle = ACQUA; g.lineWidth = 0.7 * lw;
    for (const l of laghi) { g.fill(l); g.stroke(l); }
    g.lineCap = 'round';
    for (const f of fiumi) { g.lineWidth = (f.rank <= 4 ? 1.6 : f.rank <= 7 ? 1.1 : 0.7) * lw; g.stroke(f.path); }
    g.strokeStyle = INCHIOSTRO; g.lineWidth = 0.9 * lw;
    g.stroke(terra);
    if (evidenzia) {
      g.strokeStyle = '#1b120a'; g.lineWidth = 2.4 * lw;
      for (const p of provs) if (p.owner === evidenzia) g.stroke(paths[p.id]);
    }
    if (camera.scale >= 1.6) {
      g.fillStyle = 'rgba(27, 18, 10, 0.8)'; g.font = `italic ${11 * lw}px Georgia`; g.textAlign = 'center';
      for (const p of provs) g.fillText(p.nome, centri[p.id][0], centri[p.id][1] - 16 * lw);
    }
  }

  function draw({ game, giocatore, modo, selezione, camera, evidenzia, fraz = 0, now = 0, inPausa = true, rettangolo = null }) {
    let firma = '';
    for (const p of Object.values(game.province)) firma += `${p.owner},${p.controller};`;
    const chiave = [camera.x, camera.y, camera.scale, modo, giocatore, evidenzia, size.w, size.h, pronto, firma].join('|');
    if (chiave !== chiaveBase) { drawBase(game, giocatore, modo, camera, evidenzia); chiaveBase = chiave; }
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    if (selezione.provincia) {
      ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.x, dpr * camera.y);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5 / camera.scale;
      ctx.stroke(paths[selezione.provincia]);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scr = ([x, y]) => toScreen(camera, x, y);
    for (const id of selezione.eserciti) {
      const a = game.eserciti[id];
      if (!a) continue;
      for (const s of pathSteps(game, a, centri, fraz)) drawArrow(ctx, scr(s.da), scr(s.a), `${s.giorni}g`);
    }
    markers = [];
    const scala = soldierScale(camera);
    const perProv = {};
    for (const a of Object.values(game.eserciti)) (perProv[a.prov] ??= []).push(a);
    for (const list of Object.values(perProv)) {
      list.forEach((a, i) => {
        const p = armyWorldPos(game, a, centri, fraz);
        const [sx, sy] = scr([p.x, p.y]);
        const x = sx + stackOffset(i, list.length) * scala, y = sy + 6;
        const dir = a.inBattaglia ? (i % 2 === 0 ? 1 : -1) : p.dir;
        const assedio = !a.inBattaglia && !a.percorso.length && game.province[a.prov].controller !== a.owner;
        const fase = inPausa ? 0 : now / 1000 * (a.inBattaglia ? 6 : 9);
        drawSoldier(ctx, {
          x, y, colore: game.nazioni[a.owner].colore, dir, fase, scala,
          scelto: selezione.eserciti.includes(a.id), inMarcia: p.inMarcia, battaglia: a.inBattaglia, assedio
        });
        drawLabel(ctx, x, y, a.fanteria + a.cavalleria, a.morale, game.balance.combattimento.moraleMax, scala);
        markers.push({ id: a.id, x, y: y - 14 * scala, owner: a.owner });
      });
    }
    if (rettangolo) {
      ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
      ctx.strokeRect(rettangolo.x0, rettangolo.y0, rettangolo.x1 - rettangolo.x0, rettangolo.y1 - rettangolo.y0);
      ctx.setLineDash([]);
    }
  }

  return { resize, draw, markers: () => markers, rilievoPronto: () => pronto };
}
```

- [ ] **Step 4: Collega in `public/js/main.js` e `index.html`**

`index.html`: togli `<button data-modo="terreno">Terreno</button>`.

`main.js`:
- importa `frazione` da `./ui/clock.js` (accanto a `createClock, tick, ...`);
- la selezione diventa `{ provincia: null, eserciti: [] }` in `ui` e in `avvia` (il task 7 aggiorna il resto dei riferimenti a `selezione.esercito`; in questo task sostituisci solo le assegnazioni iniziali e, in `aggiorna`, la riga di pulizia con `ui.selezione.eserciti = ui.selezione.eserciti.filter(id => g.eserciti[id]);`, e in `selezionaEsercito` imposta `ui.selezione.eserciti = a.owner === ui.session.giocatore ? [id] : [];`, in `onRightClick` usa `ui.selezione.eserciti[0]`, in `Escape` usa `{ provincia: null, eserciti: [] }`, e in `H.esercitiHtml(...)` passa `ui.selezione.eserciti[0] ?? null`);
- crea il renderer con `createRenderer(canvas, data.map, { onReady: () => { ui.sporco = true; } })`;
- aggiungi a `window.universalis`: `markers: () => renderer.markers(), rilievoPronto: () => renderer.rilievoPronto()`;
- in `frame`, disegna a ogni fotogramma (non solo se `ui.sporco`):

```js
    renderer.draw({
      game: game(), giocatore: ui.session?.giocatore ?? null, modo: ui.modo,
      selezione: ui.selezione, camera: ui.camera, evidenzia: ui.session ? null : ui.scelto,
      fraz: frazione(ui.clock), now, inPausa: ui.clock.pausa || !ui.session, rettangolo: ui.rettangolo
    });
    ui.sporco = false;
    ui.disegni++;
```

(dentro il `try`, al posto del blocco `if (ui.sporco) { ... }`); aggiungi `rettangolo: null` a `ui`.

In `tools/smoke.mjs`, sostituisci i riferimenti alla selezione singola (si allineano alla nuova forma):
- `Boolean(window.universalis.ui.selezione.esercito)` → `window.universalis.ui.selezione.eserciti.length > 0`
- `u.selezione.esercito` (nelle espressioni) → `u.selezione.eserciti[0]`
- `window.universalis.ui.selezione.esercito === null` → `window.universalis.ui.selezione.eserciti.length === 0`
- `window.universalis.ui.selezione.esercito = null;` → `window.universalis.ui.selezione.eserciti = [];`
- `window.universalis.ui.selezione.esercito !== null` → `window.universalis.ui.selezione.eserciti.length > 0`

- [ ] **Step 5: Verifica**

Run: `npm run smoke`
Expected: `smoke ok`.

Run: `npm test`
Expected: PASS, 149 test.

Guarda `smoke-inizio.png` e `smoke-gioco.png`: rilievo seppia visibile sotto i colori, fiumi, confini ondulati, soldatini al posto dei riquadri, frecce del percorso verso Veio.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/soldier.js public/js/ui/renderer.js public/js/main.js public/index.html tools/smoke.mjs
git commit -m "feat: mappa a strati con rilievo, acque e confini; soldatini animati"
```

---

### Task 7: Selezione multipla, rettangolo, unisci e dividi nell'interfaccia — *inline*

**Files:**
- Modify: `public/js/ui/input.js`, `public/js/ui/views.js`, `public/js/ui/panels.js`, `public/js/main.js`, `tools/smoke.mjs`
- Test: `test/views.test.js` (aggiunta)

**Interfaces:**
- Produces:
  - `input.js`: `onClick(x, y, { shift })`; Maiuscolo+trascinamento chiama `onBoxMove(rect)` durante e `onBox(rect)` al rilascio (`rect = { x0, y0, x1, y1 }` in coordinate della tela).
  - `views.js`: `selectionActions(game, g, ids) → { puoUnire, puoDividere }`; `armiesView(game, g, scelti = [])` con `scelto` su ogni riga.
  - `panels.js`: `esercitiHtml(list, azioni)` con bottoni `data-azione="unisci"` e `data-azione="dividi"`.

- [ ] **Step 1: Test unitario che fallisce**

In fondo a `test/views.test.js`:

```js
test('azioni sulla selezione: unire e dividere', () => {
  const g = makeGame();
  const [r] = Object.values(g.eserciti).filter(a => a.owner === 'roma');
  const b = createArmy(g, 'roma', 'a', 500, 0);
  assert.deepEqual(V.selectionActions(g, 'roma', [r.id, b.id]), { puoUnire: true, puoDividere: false });
  assert.deepEqual(V.selectionActions(g, 'roma', [r.id]), { puoUnire: false, puoDividere: true });
  b.prov = 'b';
  assert.equal(V.selectionActions(g, 'roma', [r.id, b.id]).puoUnire, false);
  assert.equal(V.selectionActions(g, 'roma', []).puoDividere, false);
  assert.deepEqual(V.armiesView(g, 'roma', [b.id]).map(a => a.scelto), [false, true]);
});
```

Run: `npm test`
Expected: FAIL (`selectionActions` non è una funzione).

- [ ] **Step 2: Implementa viste e pannello**

In `public/js/ui/views.js`:
- cambia `armiesView(game, g)` in `armiesView(game, g, scelti = [])` e aggiungi `scelto: scelti.includes(a.id)` a ogni riga;
- in fondo:

```js
export function selectionActions(game, g, ids) {
  const armies = ids.map(id => game.eserciti[id]).filter(a => a && a.owner === g);
  const fermi = armies.every(a => !a.percorso.length && !a.inBattaglia);
  const min = game.balance.combattimento.minimoUomini;
  const uno = armies.length === 1 ? armies[0] : null;
  return {
    puoUnire: armies.length >= 2 && armies.length === ids.length && fermi && armies.every(a => a.prov === armies[0].prov),
    puoDividere: Boolean(uno) && !uno.inBattaglia &&
      Math.floor(uno.fanteria / 2) + Math.floor(uno.cavalleria / 2) >= min &&
      Math.ceil(uno.fanteria / 2) + Math.ceil(uno.cavalleria / 2) >= min
  };
}
```

In `public/js/ui/panels.js`, sostituisci `esercitiHtml` con:

```js
export function esercitiHtml(list, azioni) {
  if (!list.length) return '<p class="muto">Nessun esercito. Recluta da una tua provincia.</p>';
  return '<div class="comandi">' +
    `<button data-azione="unisci"${azioni.puoUnire ? '' : ' disabled'}>Unisci</button>` +
    `<button data-azione="dividi"${azioni.puoDividere ? '' : ' disabled'}>Dividi</button></div>` +
    list.map(a => `<div class="riga${a.scelto ? ' scelta' : ''}"><span>${esc(a.provincia)}: ` +
      `${esc(a.fanteria)} fanti, ${esc(a.cavalleria)} cavalieri, morale ${esc(a.morale)}` +
      (a.destinazione ? ` → ${esc(a.destinazione)}` : '') +
      (a.inBattaglia ? ' <span class="guerra">in battaglia</span>' : '') +
      `</span><button data-azione="seleziona-esercito" data-id="${esc(a.id)}">Seleziona</button></div>`).join('') +
    '<p class="muto">Clic sul soldatino per selezionarlo, Maiuscolo+clic o Maiuscolo+trascina per sceglierne più d\'uno, clic destro sulla destinazione.</p>';
}
```

Run: `npm test`
Expected: PASS, 150 test.

- [ ] **Step 3: Controlli nella prova di fumo (devono fallire)**

In `tools/smoke.mjs`, prima di `// @@ controlli successivi @@`:

```js
  // --- soldatini: selezione, rettangolo, unisci, dividi, marcia (tappa 2b)
  await page.goto(url);
  await page.waitForSelector('#inizio-lista .carta');
  await page.click('[data-popolo="roma"]');
  await page.selectOption('#inizio-ia', 'regole');
  await page.click('#inizio-via');
  await page.waitForSelector('#barra:not([hidden])');
  const ids = await page.evaluate(async () => {
    const { createArmy } = await import('/js/sim/state.js');
    const g = window.universalis.ui.session.game;
    const a = createArmy(g, 'roma', 'roma', 800, 0).id;
    window.universalis.avanza(0);
    return Object.values(g.eserciti).filter(e => e.owner === 'roma').map(e => e.id).concat(a);
  });
  await page.waitForFunction(n => window.universalis.markers().filter(m => m.owner === 'roma').length >= n, 2);
  const box = await page.locator('#mappa').boundingBox();
  const mie = await page.evaluate(() => window.universalis.markers().filter(m => m.owner === 'roma'));
  await page.mouse.click(box.x + mie[0].x, box.y + mie[0].y);
  check(await page.evaluate(() => window.universalis.ui.selezione.eserciti.length === 1), 'clic sul soldatino: selezionato');
  await page.keyboard.down('Shift');
  await page.mouse.click(box.x + mie[1].x, box.y + mie[1].y);
  await page.keyboard.up('Shift');
  check(await page.evaluate(() => window.universalis.ui.selezione.eserciti.length === 2), 'Maiuscolo+clic: due selezionati');
  await page.keyboard.press('Escape');
  const xs = mie.map(m => m.x), ys = mie.map(m => m.y);
  await page.keyboard.down('Shift');
  await page.mouse.move(box.x + Math.min(...xs) - 25, box.y + Math.min(...ys) - 25);
  await page.mouse.down();
  await page.mouse.move(box.x + Math.max(...xs) + 25, box.y + Math.max(...ys) + 25, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up('Shift');
  check(await page.evaluate(() => window.universalis.ui.selezione.eserciti.length >= 2), 'Maiuscolo+trascina: rettangolo seleziona');
  await page.click('[data-scheda="eserciti"]');
  await page.click('[data-azione="unisci"]');
  check(await page.evaluate(() => Object.values(window.universalis.ui.session.game.eserciti).filter(e => e.owner === 'roma').length === 1), 'unisci: un solo esercito');
  check(await page.evaluate(() => window.universalis.ui.selezione.eserciti.length === 1), 'dopo l\'unione resta selezionato');
  await page.click('[data-azione="dividi"]');
  check(await page.evaluate(() => Object.values(window.universalis.ui.session.game.eserciti).filter(e => e.owner === 'roma').length === 2), 'dividi: due eserciti');
  await page.evaluate(async () => {
    const { declareWar } = await import('/js/sim/war.js');
    const g = window.universalis.ui.session.game;
    g.proposte = {}; // una proposta al giocatore fermerebbe il tempo
    declareWar(g, 'roma', 'veio');
  });
  await clickProvince('veio', 'right');
  check(await page.evaluate(() => window.universalis.ui.selezione.eserciti.every(id => window.universalis.ui.session.game.eserciti[id].percorso.at(-1) === 'veio')), 'clic destro: tutti i selezionati in marcia');
  const prima = await page.evaluate(() => window.universalis.markers().find(m => m.id === window.universalis.ui.selezione.eserciti[0]).x);
  await page.keyboard.press('1');
  await page.click('#b-pausa');
  await wait(1500);
  await page.click('#b-pausa');
  const dopo = await page.evaluate(() => window.universalis.markers().find(m => m.id === window.universalis.ui.selezione.eserciti[0]).x);
  check(Math.abs(dopo - prima) > 1, `il soldatino cammina (${prima.toFixed(1)} → ${dopo.toFixed(1)})`);
  await page.screenshot({ path: 'smoke-truppe.png' });

```

Run: `npm run smoke`
Expected: FAIL su `Maiuscolo+clic: due selezionati` e seguenti.

- [ ] **Step 4: Implementa input e comandi**

`public/js/ui/input.js` — sostituisci i gestori di `mousedown`, `mousemove`, `mouseup` con:

```js
  canvas.addEventListener('mousedown', e => {
    if (e.button === 0) down = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, drag: false, box: e.shiftKey };
  });
  const rect = e => {
    const r = canvas.getBoundingClientRect();
    return { x0: down.x - r.left, y0: down.y - r.top, x1: e.clientX - r.left, y1: e.clientY - r.top };
  };
  window.addEventListener('mousemove', e => {
    if (!down) return;
    if (!down.drag && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.drag = true;
    if (!down.drag) return;
    if (down.box) { h.onBoxMove?.(rect(e)); return; }
    h.onPan(e.clientX - down.lastX, e.clientY - down.lastY);
    down.lastX = e.clientX;
    down.lastY = e.clientY;
  });
  window.addEventListener('mouseup', e => {
    if (!down) return;
    const d = down;
    if (d.box && d.drag) { const rr = rect(e); down = null; h.onBox?.(rr); return; }
    down = null;
    if (!d.drag && e.button === 0) {
      const r = canvas.getBoundingClientRect();
      h.onClick(e.clientX - r.left, e.clientY - r.top, { shift: e.shiftKey });
    }
  });
```

`public/js/main.js`:
- importa `armiesInRect` da `./ui/armies-view.js`;
- sostituisci `selezionaEsercito` con:

```js
function selezionaEsercito(id, { centra = false, aggiungi = false } = {}) {
  const a = ui.session.game.eserciti[id];
  if (!a) return;
  ui.selezione.provincia = a.prov;
  const sel = ui.selezione.eserciti;
  if (a.owner !== ui.session.giocatore) { if (!aggiungi) ui.selezione.eserciti = []; }
  else if (aggiungi) ui.selezione.eserciti = sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id];
  else ui.selezione.eserciti = [id];
  if (centra) centerOn(ui.camera, ui.size.w, ui.size.h, ...centroDi(a.prov));
  aggiorna();
}
```

- nel gestore dei `data-azione`: `case 'seleziona-esercito': selezionaEsercito(id, { centra: true, aggiungi: e.shiftKey }); break;` e aggiungi:

```js
    case 'unisci': {
      const r = comando({ tipo: 'unisci', eserciti: ui.selezione.eserciti });
      if (r.ok) { ui.selezione.eserciti = [r.esercito]; aggiorna(); }
      break;
    }
    case 'dividi': {
      const [primo] = ui.selezione.eserciti;
      const r = comando({ tipo: 'dividi', esercito: primo });
      if (r.ok) { ui.selezione.eserciti = [primo, r.esercito]; aggiorna(); }
      break;
    }
```

- in `aggiorna`, la scheda eserciti diventa:

```js
    eserciti: () => H.esercitiHtml(V.armiesView(g, giocatore, ui.selezione.eserciti), V.selectionActions(g, giocatore, ui.selezione.eserciti)),
```

- in `attachInput`, sostituisci `onClick` e `onRightClick` e aggiungi `onBoxMove`, `onBox`:

```js
  onClick: (x, y, { shift } = {}) => {
    const army = ui.session && armyAt(renderer.markers(), x, y, 16);
    if (army) { selezionaEsercito(army, { aggiungi: shift }); return; }
    const prov = provinceAt(index, ...toWorld(ui.camera, x, y));
    if (!ui.session) { if (prov) scegli(game().province[prov].owner); return; }
    ui.selezione.provincia = prov;
    if (!shift) ui.selezione.eserciti = [];
    aggiorna();
  },
  onRightClick: (x, y) => {
    if (!ui.session || !ui.selezione.eserciti.length) return;
    const prov = provinceAt(index, ...toWorld(ui.camera, x, y));
    if (!prov) return;
    const falliti = [];
    for (const id of ui.selezione.eserciti) {
      const r = applyCommand(ui.session.game, { tipo: 'muovi', nazione: ui.session.giocatore, esercito: id, verso: prov });
      if (!r.ok) falliti.push(r.motivo);
    }
    if (falliti.length) avviso(falliti.length === ui.selezione.eserciti.length ? falliti[0] : `${falliti.length} eserciti non possono arrivarci`);
    aggiorna();
  },
  onBoxMove: r => { ui.rettangolo = r; },
  onBox: r => {
    ui.rettangolo = null;
    if (!ui.session) return;
    ui.selezione.eserciti = armiesInRect(renderer.markers(), r, ui.session.giocatore);
    aggiorna();
  },
```

- [ ] **Step 5: Verifica**

Run: `npm run smoke`
Expected: `smoke ok`. Guarda `smoke-truppe.png`: due soldatini romani con alone, frecce verso Veio con i giorni.

Run: `npm test`
Expected: PASS, 150 test.

- [ ] **Step 6: Commit**

```bash
git add public/js/ui/input.js public/js/ui/views.js public/js/ui/panels.js public/js/main.js tools/smoke.mjs test/views.test.js
git commit -m "feat: selezione multipla e a rettangolo, unisci e dividi"
```

---

### Task 8: Prova a occhio e README — *inline*

- [ ] **Step 1: Partita guardata**

Con uno script usa e getta nello scratchpad (come nella tappa 2): Roma, velocità 2, 15 secondi; screenshot a zoom iniziale, a zoom ×2 (rotella) e a zoom massimo su Lazio e Campania; uno durante una battaglia (cerca una provincia con due eserciti `inBattaglia`, centra la camera su quella). Guarda con il Read tool.

Controlla: rilievo leggibile ma non invadente sotto i colori; confini fra popoli più evidenti di quelli fra province; fiumi sopra i colori; soldatini leggibili e non sovrapposti a zoom iniziale; animazione di battaglia e tenda d'assedio visibili; nessun testo che esce dai pannelli.

- [ ] **Step 2: Correggi e riporta**

Difetti verificabili dal DOM → controllo nella prova di fumo, correzione, `npm run smoke` e `npm test`, commit `fix: ...`. Difetti solo estetici → regola colori e trasparenze, ricontrolla con lo screenshot, commit `style: ...`. Il resto → registro come `minor (deferred)`.

- [ ] **Step 3: README**

In `README.md`, sezione Comandi, aggiungi `- \`npm run build-relief\` — rigenera \`public/img/rilievo.jpg\` dai dati di elevazione (scarica i tasselli in \`data/dem/\`)`; nella sezione "Come si gioca" sostituisci la riga degli eserciti con:

```markdown
- **Eserciti**: clic sul soldatino per selezionarlo; **Maiuscolo+clic** o **Maiuscolo+trascina** per sceglierne più d'uno; **clic destro** sulla destinazione. Nella scheda Eserciti: **Unisci** e **Dividi**.
```

Commit `docs: README della tappa 2b`.
