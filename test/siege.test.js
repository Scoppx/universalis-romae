import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { createArmy } from '../public/js/sim/state.js';
import { declareWar } from '../public/js/sim/war.js';
import { siegeChance, advanceSieges } from '../public/js/sim/siege.js';

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
