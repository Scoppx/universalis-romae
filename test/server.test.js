import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../server.js';

function setup() {
  const base = mkdtempSync(path.join(tmpdir(), 'ur-'));
  const root = path.join(base, 'public');
  mkdirSync(path.join(root, 'data'), { recursive: true });
  writeFileSync(path.join(root, 'index.html'), 'ciao');
  writeFileSync(path.join(root, 'data', 'x.json'), '{"a":1}');
  writeFileSync(path.join(base, 'segreto.txt'), 'no');
  const server = createServer(root);
  return new Promise(resolve => server.listen(0, '127.0.0.1', () =>
    resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}

test('serve index e json con il tipo giusto', async () => {
  const { server, url } = await setup();
  const r1 = await fetch(`${url}/`);
  assert.equal(r1.status, 200);
  assert.match(r1.headers.get('content-type'), /text\/html/);
  assert.equal(await r1.text(), 'ciao');
  const r2 = await fetch(`${url}/data/x.json`);
  assert.match(r2.headers.get('content-type'), /application\/json/);
  server.close();
});

test('niente file fuori dalla cartella, 404 e 405', async () => {
  const { server, url } = await setup();
  assert.equal((await fetch(`${url}/..%2fsegreto.txt`)).status, 403);
  assert.equal((await fetch(`${url}/manca.js`)).status, 404);
  assert.equal((await fetch(`${url}/%E0%A4%A`)).status, 400);
  assert.equal((await fetch(`${url}/`, { method: 'POST' })).status, 405);
  server.close();
});

function setupJev(ask) {
  const server = createServer(mkdtempSync(path.join(tmpdir(), 'ur-')), { ask });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () =>
    resolve({ server, url: `http://127.0.0.1:${server.address().port}` })));
}
const post = (url, body) => fetch(`${url}/api/jev`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });

test('proxy Jev: disponibilità e inoltro', async () => {
  let ricevuto;
  const { server, url } = await setupJev(async req => { ricevuto = req; return { answers: { q: { noul: 0.8 } } }; });
  assert.deepEqual(await (await fetch(`${url}/api/jev`)).json(), { disponibile: true });
  const r = await post(url, JSON.stringify({ state: { s: 1 }, questions: { q: { type: 'noul', instructions: 'x' } } }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).answers.q.noul, 0.8);
  assert.deepEqual(ricevuto, { state: { s: 1 }, questions: { q: { type: 'noul', instructions: 'x' } } });
  assert.equal((await post(url, 'boh')).status, 400);
  assert.equal((await post(url, JSON.stringify({ state: 1 }))).status, 400);
  assert.equal((await post(url, JSON.stringify({ state: 'x'.repeat(300000), questions: {} }))).status, 413);
  server.close();
});

test('proxy Jev: senza chiave 503, errore di Jev 502', async () => {
  const a = await setupJev(null);
  assert.deepEqual(await (await fetch(`${a.url}/api/jev`)).json(), { disponibile: false });
  assert.equal((await post(a.url, JSON.stringify({ state: {}, questions: {} }))).status, 503);
  a.server.close();
  const b = await setupJev(async () => { throw new Error('Jev 529: occupato'); });
  const r = await post(b.url, JSON.stringify({ state: {}, questions: {} }));
  assert.equal(r.status, 502);
  assert.match((await r.json()).errore, /529/);
  b.server.close();
});

test('proxy Jev: niente richieste da altre pagine o altri host', async () => {
  const { server, url } = await setupJev(async () => ({ answers: {} }));
  try {
  const body = JSON.stringify({ state: {}, questions: {} });
  const testo = await fetch(`${url}/api/jev`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body });
  assert.equal(testo.status, 415); // un "simple request" cross-site non passa
  const origine = await fetch(`${url}/api/jev`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body });
  assert.equal(origine.status, 403);
  const port = new URL(url).port;
  const stessa = await fetch(`${url}/api/jev`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: `http://localhost:${port}` }, body });
  assert.equal(stessa.status, 200);
  const http = await import('node:http');
  const status = await new Promise(resolve => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/jev', method: 'POST', headers: { Host: 'evil.example', 'Content-Type': 'application/json' } }, res => resolve(res.statusCode));
    req.end(body);
  });
  assert.equal(status, 403); // DNS rebinding
  } finally {
    server.closeAllConnections();
    server.close();
  }
});
