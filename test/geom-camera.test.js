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
