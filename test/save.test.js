import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../tools/load-data.js';
import { createSession, runDays } from '../public/js/ui/session.js';
import { serialize, deserialize, writeStorage, readStorage, AUTOSAVE_KEY } from '../public/js/ui/save.js';

const data = loadData();

test('andata e ritorno: stessa partita, bilanciamento non salvato', () => {
  const s = createSession(data, 'volsci', 4);
  runDays(s, 200);
  const text = serialize(s);
  assert.equal(text.includes('"economia"'), false);
  const r = deserialize(text, data);
  assert.equal(r.ok, true);
  assert.equal(r.session.giocatore, 'volsci');
  assert.equal(r.session.seme, 4);
  assert.deepEqual(r.session.game, s.game);
  assert.equal(r.session.controllers.volsci, undefined);
  runDays(s, 100);
  runDays(r.session, 100);
  assert.deepEqual(r.session.game, s.game);
});

test('file non validi: rifiutati con un motivo', () => {
  const s = createSession(data, 'roma', 1);
  const good = JSON.parse(serialize(s));
  const bad = [
    'boh',
    JSON.stringify({ ...good, versione: 99 }),
    JSON.stringify({ ...good, giocatore: 'atlantide' }),
    JSON.stringify({ ...good, game: { ...good.game, day: -3 } }),
    JSON.stringify({ ...good, game: { ...good.game, province: { roma: good.game.province.roma } } }),
    JSON.stringify({ ...good, game: { ...good.game, eserciti: null } })
  ];
  for (const text of bad) {
    const r = deserialize(text, data);
    assert.equal(r.ok, false, text.slice(0, 40));
    assert.match(r.motivo, /non valido/);
  }
});

test('storage: funziona, e se manca o esplode non rompe nulla', () => {
  const mem = new Map();
  const ok = { setItem: (k, v) => mem.set(k, v), getItem: k => mem.get(k) ?? null };
  assert.equal(writeStorage(ok, AUTOSAVE_KEY, 'x'), true);
  assert.equal(readStorage(ok, AUTOSAVE_KEY), 'x');
  const broken = { setItem() { throw new Error('quota'); }, getItem() { throw new Error('vietato'); } };
  assert.equal(writeStorage(broken, AUTOSAVE_KEY, 'x'), false);
  assert.equal(readStorage(broken, AUTOSAVE_KEY), null);
  assert.equal(writeStorage(null, AUTOSAVE_KEY, 'x'), false);
  assert.equal(readStorage(null, AUTOSAVE_KEY), null);
});
