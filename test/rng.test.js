import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRandom, rollD10 } from '../public/js/sim/rng.js';

test('stesso seme, stessa sequenza', () => {
  const a = { rng: 42 }, b = { rng: 42 };
  const sa = Array.from({ length: 20 }, () => nextRandom(a));
  const sb = Array.from({ length: 20 }, () => nextRandom(b));
  assert.deepEqual(sa, sb);
  assert.equal(a.rng, b.rng);
});

test('valori in [0,1) e semi diversi danno sequenze diverse', () => {
  const a = { rng: 1 }, b = { rng: 2 };
  for (let i = 0; i < 1000; i++) {
    const x = nextRandom(a);
    assert.ok(x >= 0 && x < 1);
  }
  assert.notEqual(nextRandom({ rng: 1 }), nextRandom(b));
});

test('rollD10 copre 0..9', () => {
  const g = { rng: 7 };
  const seen = new Set();
  for (let i = 0; i < 1000; i++) seen.add(rollD10(g));
  assert.deepEqual([...seen].sort((x, y) => x - y), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
