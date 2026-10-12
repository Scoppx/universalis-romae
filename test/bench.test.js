import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runBench } from '../bench.js';

async function stubAsk({ questions }) {
  const answers = {};
  for (const [k, q] of Object.entries(questions)) {
    if (q.type === 'noul') { answers[k] = { noul: 0.7 }; continue; }
    const keys = Object.keys(q.criteria);
    answers[k] = { choice: keys[0], probabilities: Object.fromEntries(keys.map((o, i) => [o, i === 0 ? 0.9 : 0.1 / (keys.length - 1)])) };
  }
  return { answers, usage: { input_tokens: 50, output_tokens: 5 } };
}

test('il bench a regole riporta tutti i popoli in ordine di punteggio', async () => {
  const { righe } = await runBench({ anni: 5, semi: 1 });
  assert.equal(righe.length, 38);
  const sorted = [...righe].sort((a, b) => b.punteggio - a.punteggio);
  assert.deepEqual(righe.map(r => r.id), sorted.map(r => r.id));
  assert.ok(righe.every(r => r.ia === 'regole'));
});

test('bench misto: metà dei popoli con Jev, conteggi e rigioco identico', async () => {
  const records = [];
  const a = await runBench({ anni: 2, semi: 1, ia: 'misto', ask: stubAsk, registro: r => records.push(r) });
  assert.equal(a.righe.filter(r => r.ia === 'jev').length, 19);
  assert.ok(a.totali.richieste > 0);
  assert.equal(a.totali.tokenInput, a.totali.richieste * 50);
  const b = await runBench({ anni: 2, semi: 1, ia: 'misto', records });
  assert.deepEqual(b.righe, a.righe);
});
