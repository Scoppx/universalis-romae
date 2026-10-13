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
