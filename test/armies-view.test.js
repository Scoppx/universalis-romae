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
