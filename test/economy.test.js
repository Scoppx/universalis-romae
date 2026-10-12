import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { monthlyIncome, monthlyUpkeep, monthlyEconomy, yearlyUpdate, stabilityCost, raiseStability } from '../public/js/sim/economy.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('entrate: solo province controllate, modificate dalla stabilità', () => {
  const g = makeGame();
  close(monthlyIncome(g, 'roma'), 0.6);
  g.nazioni.roma.stabilita = 3;
  close(monthlyIncome(g, 'roma'), 0.6 * 1.15);
  g.nazioni.roma.stabilita = 0;
  g.province.b.controller = 'volsci';
  close(monthlyIncome(g, 'roma'), 0.4);
});

test('mantenimento: la cavalleria costa il doppio', () => {
  const g = makeGame();
  close(monthlyUpkeep(g, 'roma'), (2340 + 234 * 2) / 1000 * 0.2);
});

test('mese: tesoro e uomini salgono, uomini con tetto', () => {
  const g = makeGame();
  const t0 = g.nazioni.roma.tesoro;
  monthlyEconomy(g);
  close(g.nazioni.roma.tesoro, t0 + monthlyIncome(g, 'roma') - monthlyUpkeep(g, 'roma'));
  assert.equal(g.nazioni.roma.uomini, 1950 + Math.round(6 * 25 * 1.3));
  g.nazioni.roma.uomini = 3899;
  monthlyEconomy(g);
  assert.equal(g.nazioni.roma.uomini, 3900);
});

test('debito: gli eserciti disertano, senza NaN', () => {
  const g = makeGame();
  g.nazioni.roma.tesoro = -50;
  monthlyEconomy(g);
  const a = Object.values(g.eserciti).find(x => x.owner === 'roma');
  assert.equal(a.fanteria, Math.floor(2340 * 0.95));
  assert.ok(Number.isFinite(g.nazioni.roma.tesoro));
});

test('anno: infamia cala fino a 0, stabilità negativa risale', () => {
  const g = makeGame();
  g.nazioni.roma.infamia = 1.5;
  g.nazioni.roma.stabilita = -3;
  for (let i = 0; i < 60; i++) yearlyUpdate(g);
  assert.equal(g.nazioni.roma.infamia, 0);
  assert.ok(g.nazioni.roma.stabilita > -3);
});

test('alzare la stabilità costa e ha un tetto', () => {
  const g = makeGame();
  assert.equal(stabilityCost(g, 'roma'), 10 + 2 * 6);
  assert.equal(raiseStability(g, 'roma').ok, false); // 3.6 < 22
  g.nazioni.roma.tesoro = 100;
  assert.equal(raiseStability(g, 'roma').ok, true);
  close(g.nazioni.roma.tesoro, 78);
  g.nazioni.roma.stabilita = 3;
  assert.deepEqual(raiseStability(g, 'roma'), { ok: false, motivo: 'stabilità al massimo' });
});
