import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const popoli = JSON.parse(readFileSync(new URL('../public/data/popoli.json', import.meta.url))).popoli;
const GOVERNI = ['tribù', 'monarchia', 'repubblica', 'lega', 'città-stato'];
const DIFF = ['facile', 'normale', 'difficile', 'molto difficile'];
const TRATTI = { reclute: [0, 0.5], stabilita: [0, 0.5], assimilazione: [0, 0.5], battaglia: [0, 1], montagna: [0, 2], assedio: [-0.5, 0.5] };

test('popoli: 38 attivi e 13 dormienti, id unici', () => {
  assert.equal(popoli.filter(p => !p.dormiente).length, 38);
  assert.equal(popoli.filter(p => p.dormiente).length, 13);
  assert.equal(new Set(popoli.map(p => p.id)).size, popoli.length);
});

test('popoli: campi validi', () => {
  const colori = new Set();
  for (const p of popoli) {
    assert.match(p.id, /^[a-z_]+$/, p.id);
    assert.ok(p.nome && p.cultura && p.capitale, p.id);
    assert.ok(GOVERNI.includes(p.governo), `${p.id}: ${p.governo}`);
    assert.ok(DIFF.includes(p.difficolta), `${p.id}: ${p.difficolta}`);
    assert.match(p.colore, /^#[0-9a-f]{6}$/, p.id);
    if (!p.dormiente) { assert.ok(!colori.has(p.colore), `colore ripetuto ${p.colore}`); colori.add(p.colore); }
    assert.ok(typeof p.carattere === 'string' && p.carattere.length >= 20, `${p.id}: carattere troppo corto`);
    assert.ok(Object.keys(p.tratti).length <= 3, p.id);
    for (const [k, v] of Object.entries(p.tratti)) {
      assert.ok(TRATTI[k], `${p.id}: tratto ${k}`);
      assert.ok(v >= TRATTI[k][0] && v <= TRATTI[k][1], `${p.id}: ${k}=${v}`);
    }
  }
});

test('Roma facile, Volsci molto difficili', () => {
  const by = Object.fromEntries(popoli.map(p => [p.id, p]));
  assert.equal(by.roma.difficolta, 'facile');
  assert.equal(by.volsci.difficolta, 'molto difficile');
  assert.ok(Object.keys(by.volsci.tratti).length <= 1);
});
