import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBench } from '../bench.js';

test('il bench gira sulla mappa reale e riporta tutti i popoli', () => {
  const rows = runBench({ anni: 5, semi: 1 });
  assert.equal(rows.length, 38);
  for (const r of rows) {
    assert.ok(r.vivo >= 0 && r.vivo <= 1);
    assert.ok(Number.isFinite(r.punteggio));
  }
  const sorted = [...rows].sort((a, b) => b.punteggio - a.punteggio);
  assert.deepEqual(rows.map(r => r.id), sorted.map(r => r.id));
});
