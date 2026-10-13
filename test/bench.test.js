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
  assert.ok(righe.length >= 38); // in 5 anni può nascere un popolo da un'indipendenza
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

// Jev finto che sceglie sempre l'ultima opzione (una guerra, un obiettivo offensivo, rifiuta la pace).
async function aggressivo({ questions }) {
  const answers = {};
  for (const [k, q] of Object.entries(questions)) {
    const keys = Object.keys(q.criteria);
    answers[k] = { choice: keys.at(-1), probabilities: Object.fromEntries(keys.map((o, i) => [o, i === keys.length - 1 ? 0.9 : 0.1 / (keys.length - 1)])) };
  }
  return { answers, usage: { input_tokens: 50, output_tokens: 5 } };
}

test('rigioco di un registro con più semi: ogni seme rigioca le sue decisioni', async () => {
  const records = [];
  const a = await runBench({ anni: 3, semi: 2, ia: 'jev', ask: aggressivo, registro: r => records.push(r) });
  assert.ok(records.every(r => r.seme === 1 || r.seme === 2));
  const b = await runBench({ anni: 3, semi: 2, ia: 'jev', records });
  assert.deepEqual(b.righe, a.righe);
});

test('riepilogo del bench: difficoltà, Roma, guerre, popoli nuovi, obiettivi', async () => {
  const { riepilogo: r } = await runBench({ anni: 3, semi: 1 });
  assert.deepEqual(Object.keys(r.perDifficolta).sort(), ['difficile', 'facile', 'molto difficile', 'normale']);
  assert.ok(r.totale > 0 && r.totale <= 1);
  assert.equal(r.roma.provinceInizio, 1);
  assert.ok(r.guerre.perAnno >= 0 && r.guerre.perPopoloAnno.regole >= 0);
  assert.equal(r.guerre.perPopoloAnno.jev, null); // nessun popolo con Jev
  assert.ok(r.nuovi.nati >= 0);
  assert.deepEqual(r.obiettivi.map(o => o.nome), ['facile', 'Roma cresce', 'normale', 'difficile', 'molto difficile', 'totale']);
  assert.ok(r.obiettivi.every(o => typeof o.ok === 'boolean'));
  const { righe } = await runBench({ anni: 1, semi: 1 });
  assert.equal(righe.filter(x => x.iniziale).length, 38); // dormienti e popoli nati dopo non contano
});
