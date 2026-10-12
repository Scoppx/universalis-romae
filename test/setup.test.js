import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf, maxManpower } from '../public/js/sim/state.js';

test('ogni popolo attivo parte con un esercito nella capitale', () => {
  const g = makeGame();
  assert.deepEqual(g.ordine, ['roma', 'latini', 'volsci', 'siculi']);
  const [r] = armiesOf(g, 'roma');
  assert.equal(r.prov, 'a');
  assert.equal(r.fanteria, 2340); // (4+2) * 300 * 1.3
  assert.equal(r.cavalleria, 234);
  assert.equal(r.morale, 3);
});

test('i popoli dormienti non entrano in partita', () => {
  assert.equal(makeGame().nazioni.taranto, undefined);
});

test('tesoro, uomini e controllo iniziali', () => {
  const g = makeGame();
  assert.ok(Math.abs(g.nazioni.roma.tesoro - 3.6) < 1e-9); // 6 * 0.1 * 6
  assert.equal(maxManpower(g, 'roma'), 3900); // 6 * 500 * 1.3
  assert.equal(g.nazioni.roma.uomini, 1950);
  for (const p of Object.values(g.province)) assert.equal(p.controller, p.owner);
  assert.deepEqual(g.stretti, ['f|g']);
});

test('lo stato è JSON puro', () => {
  const g = makeGame();
  assert.deepEqual(JSON.parse(JSON.stringify(g)), g);
});
