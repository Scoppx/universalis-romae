import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ringArea, pointInRing, simplifyRing, sharedVertexCount, buildProvinces, buildAdjacency } from '../tools/geo.js';

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
