import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { createArmy } from '../public/js/sim/state.js';
import { declareWar } from '../public/js/sim/war.js';
import { siegeChance, advanceSieges, garrison, siegeRate, daysLeft } from '../public/js/sim/siege.js';

function setup() {
  const g = makeGame();
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  return g;
}

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('probabilità: forza, fortificazione, tratto, tetto', () => {
  const g = setup();
  const a = createArmy(g, 'roma', 'c', 5000, 0);
  close(siegeChance(g, a, g.province.c), 0.1);
  g.province.c.fort = 3;
  close(siegeChance(g, a, g.province.c), 0.025);
  g.nazioni.roma.tratti.assedio = -0.5;
  close(siegeChance(g, a, g.province.c), 0.0125);
  a.fanteria = 1000000;
  g.nazioni.roma.tratti.assedio = 0;
  close(siegeChance(g, a, g.province.c), 0.2);
});

test('in guerra la provincia cade', () => {
  const g = setup();
  declareWar(g, 'roma', 'volsci');
  createArmy(g, 'roma', 'c', 5000, 0);
  for (let i = 0; i < 100 && g.province.c.controller === 'volsci'; i++) advanceSieges(g);
  assert.equal(g.province.c.controller, 'roma');
  assert.ok(g.log.some(e => e.tipo === 'assedio'));
});

test('niente assedio senza guerra o con nemici presenti', () => {
  const g = setup();
  createArmy(g, 'roma', 'c', 5000, 0);
  for (let i = 0; i < 100; i++) advanceSieges(g);
  assert.equal(g.province.c.controller, 'volsci');
  declareWar(g, 'roma', 'volsci');
  createArmy(g, 'volsci', 'c', 100, 0);
  for (let i = 0; i < 100; i++) advanceSieges(g);
  assert.equal(g.province.c.controller, 'volsci');
});

test('una provincia propria occupata si riprende', () => {
  const g = setup();
  declareWar(g, 'roma', 'volsci');
  g.province.b.controller = 'volsci';
  createArmy(g, 'roma', 'b', 5000, 0);
  for (let i = 0; i < 100 && g.province.b.controller !== 'roma'; i++) advanceSieges(g);
  assert.equal(g.province.b.controller, 'roma');
});

test('presidio: uomini della provincia × 250 × (1 + fortificazione)', () => {
  const g = setup();
  g.province.c.uomini = 2; g.province.c.fort = 1;
  assert.equal(garrison(g, g.province.c), 1000);
});

test('assedio a giorni contati: cade esattamente il giorno annunciato', () => {
  const g = setup();
  declareWar(g, 'roma', 'volsci');
  createArmy(g, 'roma', 'c', 5000, 0);
  const giorni = daysLeft(g, g.province.c);
  assert.equal(giorni, Math.ceil(100 / siegeRate(g, 'roma', 5000, g.province.c)));
  for (let i = 1; i < giorni; i++) {
    advanceSieges(g);
    assert.equal(g.province.c.controller, 'volsci', `giorno ${i}`);
    assert.equal(daysLeft(g, g.province.c), giorni - i);
  }
  advanceSieges(g);
  assert.equal(g.province.c.controller, 'roma');
  assert.equal(g.province.c.assedio, null);
});

test('due eserciti sommano gli uomini; se se ne vanno i punti si azzerano', () => {
  const g = setup();
  declareWar(g, 'roma', 'volsci');
  const a = createArmy(g, 'roma', 'c', 2500, 0);
  createArmy(g, 'roma', 'c', 2500, 0);
  assert.equal(daysLeft(g, g.province.c), Math.ceil(100 / siegeRate(g, 'roma', 5000, g.province.c)));
  advanceSieges(g);
  assert.ok(g.province.c.assedio.punti > 0);
  for (const e of Object.values(g.eserciti)) e.prov = 'b';
  advanceSieges(g);
  assert.equal(g.province.c.assedio, null);
  assert.equal(daysLeft(g, g.province.c), null);
  a.prov = 'c';
  assert.equal(daysLeft(g, g.province.c), Math.ceil(100 / siegeRate(g, 'roma', 2500, g.province.c)));
});
