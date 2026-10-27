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

test('ambizioni: ogni popolo (anche dormiente) ne ha una, valida', async () => {
  const { loadData } = await import('../tools/load-data.js');
  const { map, popoli: { popoli: tutti }, ambizioni } = loadData();
  assert.ok(ambizioni, 'ambizioni.json caricato');
  const ids = new Set(map.province.map(p => p.id));
  const iniziali = id => map.province.filter(p => p.owner === id).map(p => p.id);
  for (const r of Object.values(ambizioni.regioni)) {
    assert.ok(r.nome && r.province.length);
    for (const p of r.province) assert.ok(ids.has(p), `provincia ${p}`);
  }
  for (const p of tutti) {
    const a = ambizioni.popoli[p.id];
    assert.ok(a, `ambizione di ${p.id}`);
    if (a.tipo === 'sopravvivere') assert.ok(Number.isInteger(a.anno) && a.anno >= 264 && a.anno <= 753, p.id);
    else {
      assert.equal(a.tipo, 'regione');
      const r = ambizioni.regioni[a.regione];
      assert.ok(r, `regione di ${p.id}`);
      const mie = iniziali(p.id);
      for (const q of mie) assert.ok(r.province.includes(q), `${p.id}: ${q} nella sua regione`);
      if (!['italia', 'sicilia', 'sicilia_occidentale'].includes(a.regione)) {
        assert.ok(r.province.length >= 2 * mie.length && r.province.length <= 3 * mie.length, `${p.id}: ${r.province.length} per ${mie.length}`);
      }
    }
  }
  assert.deepEqual(ambizioni.popoli.veio, { tipo: 'sopravvivere', anno: 371 });
  assert.equal(ambizioni.popoli.roma.regione, 'italia');
  assert.equal(ambizioni.regioni.italia.province.length, map.province.length);
  const vicini = Object.fromEntries(map.province.map(p => [p.id, p.vicini]));
  for (const [id, o] of Object.entries(ambizioni.orde)) {
    const r = ambizioni.regioni[o.regione].province;
    assert.ok(!r.includes(o.ingresso), `${id}: ingresso fuori regione`);
    assert.ok(r.some(q => vicini[q].includes(o.ingresso)), `${id}: ingresso confinante`);
  }
  assert.deepEqual(Object.keys(ambizioni.orde).sort(), ['boi', 'insubri', 'senoni']);
});
