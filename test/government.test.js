import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame, fixtureMap, fixturePopoli, balance } from './fixtures.js';
import { createGame } from '../public/js/sim/setup.js';
import { maxManpower, createArmy, armiesOf } from '../public/js/sim/state.js';
import { monthlyIncome, monthlyManpower, yearlyUpdate } from '../public/js/sim/economy.js';
import { checkSlider, moveSlider } from '../public/js/sim/government.js';
import { checkProposal, changeRelation } from '../public/js/sim/diplomacy.js';
import { battleModifier } from '../public/js/sim/combat.js';
import { applyCommand } from '../public/js/sim/commands.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('governo: tribù e città-stato cambiano tasse e reclute', () => {
  const g = makeGame();
  const tasse = monthlyIncome(g, 'roma'), uomini = monthlyManpower(g, 'roma'), max = maxManpower(g, 'roma');
  g.nazioni.roma.governo = 'tribù';
  close(monthlyIncome(g, 'roma'), tasse * 0.8);
  assert.equal(monthlyManpower(g, 'roma'), Math.round(6 * 25 * (1 + 0.3 + 0.2)));
  assert.equal(maxManpower(g, 'roma'), Math.round(6 * 500 * 1.5));
  g.nazioni.roma.governo = 'città-stato';
  close(monthlyIncome(g, 'roma'), tasse * 1.2);
  assert.ok(monthlyManpower(g, 'roma') < uomini && maxManpower(g, 'roma') < max);
});

test('governo: la monarchia tende a stabilità +1', () => {
  const g = makeGame();
  g.nazioni.roma.governo = 'monarchia';
  g.nazioni.latini.governo = 'monarchia';
  g.nazioni.latini.stabilita = 3;
  for (let i = 0; i < 80; i++) yearlyUpdate(g);
  assert.equal(g.nazioni.roma.stabilita, 1);
  assert.equal(g.nazioni.latini.stabilita, 1);
});

test('governo: la lega chiede il foedus con forza doppia invece che tripla', () => {
  const g = makeGame();
  changeRelation(g, 'roma', 'latini', 100);
  g.nazioni.latini.uomini = 0;
  for (const a of Object.values(g.eserciti)) if (a.owner === 'latini') { a.fanteria = 1000; a.cavalleria = 0; }
  for (const a of Object.values(g.eserciti)) if (a.owner === 'roma') { a.fanteria = 2500 - g.nazioni.roma.uomini * 0.5; a.cavalleria = 0; }
  assert.equal(checkProposal(g, 'roma', 'foedus', 'latini'), 'non abbastanza più forte');
  g.nazioni.roma.governo = 'lega';
  assert.equal(checkProposal(g, 'roma', 'foedus', 'latini'), null);
});

test('slider: una mossa ogni 10 anni (15 per la repubblica), entro ±5', () => {
  const g = makeGame();
  assert.equal(checkSlider(g, 'roma', 'boh', 1), 'slider sconosciuto');
  assert.equal(checkSlider(g, 'roma', 'guerra', 2), 'verso non valido');
  assert.deepEqual(moveSlider(g, 'roma', 'guerra', 1), { ok: true });
  assert.equal(g.nazioni.roma.slider.guerra, 1);
  assert.equal(checkSlider(g, 'roma', 'societa', -1), 'prossima riforma tra 10 anni');
  g.day += 3650;
  assert.equal(checkSlider(g, 'roma', 'societa', -1), null);
  g.nazioni.roma.governo = 'repubblica';
  assert.equal(checkSlider(g, 'roma', 'societa', -1), 'prossima riforma tra 5 anni');
  g.nazioni.roma.slider.guerra = 5;
  g.nazioni.roma.ultimoSlider = null;
  assert.equal(checkSlider(g, 'roma', 'guerra', 1), 'già al limite');
  assert.equal(checkSlider(g, 'ribelli', 'guerra', 1), 'nazione inesistente');
});

test('slider della società: patrizi +2% tasse, plebe +3% reclute per punto', () => {
  const g = makeGame();
  const tasse = monthlyIncome(g, 'roma');
  g.nazioni.roma.slider.societa = -5;
  close(monthlyIncome(g, 'roma'), tasse * 1.1);
  g.nazioni.roma.slider.societa = 4;
  close(monthlyIncome(g, 'roma'), tasse);
  assert.equal(monthlyManpower(g, 'roma'), Math.round(6 * 25 * (1 + 0.3 + 0.12)));
});

test('dado: stabilità ±2 vale ±1, slider di guerra agli estremi +1 in attacco o in difesa', () => {
  const g = makeGame();
  const a = createArmy(g, 'roma', 'c', 1000, 0); // c è dei volsci: roma attacca
  const prov = g.province.c;
  const base = battleModifier(g, prov, [a]);
  g.nazioni.roma.stabilita = 2;
  assert.equal(battleModifier(g, prov, [a]), base + 1);
  g.nazioni.roma.stabilita = -2;
  assert.equal(battleModifier(g, prov, [a]), base - 1);
  g.nazioni.roma.stabilita = 0;
  g.nazioni.roma.slider.guerra = 4;
  assert.equal(battleModifier(g, prov, [a]), base + 1);
  g.nazioni.roma.slider.guerra = -5;
  assert.equal(battleModifier(g, prov, [a]), base);
  const d = createArmy(g, 'volsci', 'c', 1000, 0);
  const dBase = battleModifier(g, prov, [d]);
  g.nazioni.volsci.slider.guerra = -4;
  assert.equal(battleModifier(g, prov, [d]), dBase + 1);
});

test('comando slider', () => {
  const g = makeGame();
  assert.deepEqual(applyCommand(g, { tipo: 'slider', nazione: 'roma', quale: 'governo', verso: -1 }), { ok: true });
  assert.equal(g.nazioni.roma.slider.governo, -1);
  assert.equal(g.nazioni.roma.ultimoSlider, 0);
  assert.equal(applyCommand(g, { tipo: 'slider', nazione: 'roma', quale: 'governo', verso: -1 }).ok, false);
});

test('difficoltà: esercito, tesoro, riserva iniziali e dado', () => {
  const base = makeGame();
  const pop = structuredClone(fixturePopoli);
  pop.popoli.find(p => p.id === 'roma').difficolta = 'facile';
  const g = createGame({ map: fixtureMap, popoli: pop, balance, seed: 1 });
  const d = balance.difficolta.facile;
  assert.equal(g.nazioni.roma.difficolta, 'facile');
  const fanti = a => armiesOf(a, 'roma')[0].fanteria;
  assert.equal(fanti(g), Math.round(fanti(base) * d.esercito));
  assert.ok(Math.abs(g.nazioni.roma.tesoro - base.nazioni.roma.tesoro * d.tesoro) < 1e-9);
  assert.equal(g.nazioni.roma.uomini, Math.round(base.nazioni.roma.uomini * d.uomini));
  const a = createArmy(g, 'roma', 'c', 1000, 0), b = createArmy(base, 'roma', 'c', 1000, 0);
  assert.equal(battleModifier(g, g.province.c, [a]), battleModifier(base, base.province.c, [b]) + d.dado);
  assert.equal(base.nazioni.latini.difficolta, 'normale');
});

test('difficoltà: bonus di reclute e tasse per tutta la partita', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.difficolta.facile = { reclute: 1, tasse: 0.5 };
  const tasse = monthlyIncome(g, 'roma'), uomini = monthlyManpower(g, 'roma'), max = maxManpower(g, 'roma');
  g.nazioni.roma.difficolta = 'facile';
  close(monthlyIncome(g, 'roma'), tasse * 1.5);
  assert.equal(monthlyManpower(g, 'roma'), Math.round(6 * 25 * (1 + 0.3 + 1)));
  assert.equal(maxManpower(g, 'roma'), Math.round(6 * 500 * (1 + 0.3 + 1)));
  assert.ok(monthlyManpower(g, 'roma') > uomini && maxManpower(g, 'roma') > max);
});
