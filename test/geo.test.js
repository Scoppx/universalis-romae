import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringArea, pointInRing, simplifyRing, sharedVertexCount, buildProvinces, buildAdjacency, roughEdge, roughenRing, sharedBorder, simplifyLine } from '../tools/geo.js';

const square = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];

test('area e punto nel poligono', () => {
  assert.equal(Math.abs(ringArea(square)), 10000);
  assert.equal(pointInRing([50, 50], square), true);
  assert.equal(pointInRing([150, 50], square), false);
});

test('semplificazione: toglie i punti allineati, tiene gli angoli', () => {
  const ring = [[0, 0], [50, 0.1], [100, 0], [100, 100], [0, 100], [0, 0]];
  assert.deepEqual(simplifyRing(ring, 0.5), square);
});

test('quattro centri in un quadrato: quattro celle, confini solo sui lati', () => {
  const centers = [
    { id: 'no', x: 25, y: 25 }, { id: 'ne', x: 75, y: 25 },
    { id: 'so', x: 25, y: 75 }, { id: 'se', x: 75, y: 75 }
  ];
  const cells = buildProvinces({ pieces: [[square]], centers, width: 100, height: 100 });
  for (const c of cells) {
    const area = c.poligoni.reduce((s, poly) => s + Math.abs(ringArea(poly[0])), 0);
    assert.ok(Math.abs(area - 2500) < 1e-6, `${c.id}: ${area}`);
  }
  const adj = buildAdjacency(cells, { collegamenti: [], tagli: [['no', 'ne']] });
  assert.deepEqual(adj.no, ['so']);
  assert.deepEqual(adj.se.sort(), ['ne', 'so']);
  assert.equal(sharedVertexCount(cells[0].poligoni, cells[3].poligoni, 0.5), 1); // solo l'angolo
});

test('isole separate: niente confine attraverso il mare, sì con un collegamento', () => {
  const left = [[0, 0], [40, 0], [40, 100], [0, 100], [0, 0]];
  const right = [[60, 0], [100, 0], [100, 100], [60, 100], [60, 0]];
  const centers = [{ id: 'l', x: 20, y: 50 }, { id: 'r', x: 80, y: 50 }];
  const cells = buildProvinces({ pieces: [[left], [right]], centers, width: 100, height: 100 });
  assert.deepEqual(cells.map(c => c.piece), [0, 1]);
  const area = c => c.poligoni.reduce((s, poly) => s + Math.abs(ringArea(poly[0])), 0);
  assert.ok(Math.abs(area(cells[0]) - 4000) < 1e-6); // tutta l'isola, anche oltre la metà
  assert.deepEqual(buildAdjacency(cells, { collegamenti: [], tagli: [] }).l, []);
  assert.deepEqual(buildAdjacency(cells, { collegamenti: [['l', 'r']], tagli: [] }).l, ['r']);
});

test('una terra con un solo centro diventa una sola provincia intera', () => {
  const [c] = buildProvinces({ pieces: [[square]], centers: [{ id: 'solo', x: 10, y: 10 }], width: 100, height: 100 });
  assert.ok(Math.abs(Math.abs(ringArea(c.poligoni[0][0])) - 10000) < 1e-6);
});

test('un centro in mare è un errore', () => {
  assert.throws(
    () => buildProvinces({ pieces: [[square]], centers: [{ id: 'x', x: 150, y: 50 }], width: 200, height: 100 }),
    /x/
  );
});

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
