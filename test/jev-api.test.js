import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAsk, JEV_URL, JEV_MODEL } from '../jev-api.js';

const json = (status, body) => ({ ok: status < 300, status, text: async () => JSON.stringify(body) });

test('manda chiave, modello, stato e domande', async () => {
  let seen;
  const ask = createAsk({ key: 'k1', fetchImpl: async (url, opts) => { seen = { url, opts }; return json(200, { answers: { x: { noul: 0.9 } } }); } });
  const r = await ask({ state: { a: 1 }, questions: { x: { type: 'noul', instructions: 'ok?' } } });
  assert.equal(r.answers.x.noul, 0.9);
  assert.equal(seen.url, JEV_URL);
  assert.equal(seen.opts.headers.Authorization, 'Bearer k1');
  assert.deepEqual(JSON.parse(seen.opts.body), { model: JEV_MODEL, state: { a: 1 }, questions: { x: { type: 'noul', instructions: 'ok?' } } });
});

test('un nuovo tentativo su 429, errore leggibile sugli altri codici', async () => {
  let n = 0;
  const ask = createAsk({ key: 'k', retryMs: 1, fetchImpl: async () => (++n === 1 ? json(429, {}) : json(200, { answers: {} })) });
  assert.deepEqual(await ask({ state: {}, questions: {} }), { answers: {} });
  assert.equal(n, 2);
  const bad = createAsk({ key: 'k', retryMs: 1, fetchImpl: async () => json(401, { detail: 'chiave' }) });
  await assert.rejects(bad({ state: {}, questions: {} }), /Jev 401/);
});
