import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../tools/load-data.js';
import { createGame } from '../public/js/sim/setup.js';

const { map, popoli, balance } = loadData();
const byId = Object.fromEntries(map.province.map(p => [p.id, p]));
const active = popoli.popoli.filter(p => !p.dormiente);

test('149 province con dati validi', () => {
  assert.equal(map.province.length, 149);
  const TERRENI = ['pianura', 'collina', 'montagna', 'palude'];
  for (const p of map.province) {
    assert.ok(TERRENI.includes(p.terreno), p.id);
    assert.ok(Number.isInteger(p.tasse) && p.tasse >= 1 && p.tasse <= 10, p.id);
    assert.ok(Number.isInteger(p.uomini) && p.uomini >= 1 && p.uomini <= 10, p.id);
    assert.ok(Number.isInteger(p.fort) && p.fort >= 0 && p.fort <= 3, p.id);
    assert.ok(active.some(n => n.id === p.owner), `${p.id}: owner ${p.owner}`);
    assert.ok(p.poligoni.length > 0, p.id);
  }
});

test('ogni provincia ha vicini simmetrici', () => {
  for (const p of map.province) {
    assert.ok(p.vicini.length > 0, `${p.id} isolata`);
    for (const v of p.vicini) assert.ok(byId[v].vicini.includes(p.id), `${p.id}-${v} non simmetrico`);
  }
});

test('terraferma e Sicilia formano un solo grafo grazie allo stretto', () => {
  const seen = new Set(['roma']);
  const queue = ['roma'];
  while (queue.length) for (const v of byId[queue.shift()].vicini) if (!seen.has(v)) { seen.add(v); queue.push(v); }
  assert.equal(seen.size, map.province.length);
  assert.ok(byId.rhegion.vicini.includes('zankle'));
});

test('capitali: ogni popolo possiede la sua; i dormienti puntano a centri esistenti', () => {
  for (const n of active) assert.equal(byId[n.capitale]?.owner, n.id, n.id);
  for (const n of popoli.popoli.filter(p => p.dormiente)) assert.ok(byId[n.capitale], n.id);
});

test('vincoli di bilanciamento', () => {
  assert.deepEqual([byId.roma.tasse, byId.roma.uomini, byId.roma.fort], [5, 5, 2]);
  const volsci = map.province.filter(p => p.owner === 'volsci').reduce((s, p) => s + p.tasse, 0);
  assert.ok(volsci <= 6, `volsci ${volsci}`);
  for (const p of map.province) {
    const max = ['capua', 'caere', 'tarquinia', 'veio'].includes(p.id) ? 7 : 6;
    if (p.id !== 'roma') assert.ok(p.tasse <= max, `${p.id} ${p.tasse}`);
    if (p.terreno === 'montagna') assert.ok(p.tasse <= 3, `${p.id} montagna ${p.tasse}`);
  }
});

test('la partita reale si crea', () => {
  const g = createGame({ map, popoli, balance, seed: 1 });
  assert.equal(g.ordine.length, 38);
  assert.equal(Object.keys(g.eserciti).length, 38);
});

const distPunto = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);

test('fiumi e laghi: il Tevere passa da Roma, laghi a nord', () => {
  assert.ok(map.fiumi.length >= 20);
  assert.ok(map.fiumi.some(f => f.punti.some(p => distPunto(p, byId.roma.centro) < 20)), 'nessun fiume vicino a Roma');
  assert.ok(map.laghi.length >= 3);
  assert.ok(map.laghi.some(l => l[0].every(([, y]) => y < 350)), 'nessun lago al nord');
});

test('confini condivisi: uno o più tratti per ogni coppia di vicini sulla stessa terra', () => {
  const coppie = new Set(map.confini.map(c => [c.a, c.b].sort().join('|')));
  for (const p of map.province) for (const v of p.vicini) {
    if (map.stretti.some(([x, y]) => [x, y].sort().join('|') === [p.id, v].sort().join('|'))) continue;
    assert.ok(coppie.has([p.id, v].sort().join('|')), `${p.id}-${v} senza confine`);
  }
  assert.ok(map.confini.every(c => c.punti.length >= 2));
});

test('confini irregolari: le linee fra province non sono più segmenti dritti', () => {
  assert.ok(map.confini.some(c => c.punti.length > 4));
});
