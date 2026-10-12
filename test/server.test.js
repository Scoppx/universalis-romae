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
