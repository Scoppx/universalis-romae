import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { advanceDay } from '../public/js/sim/loop.js';
import { declareWar, hasPretext } from '../public/js/sim/war.js';
import { relation, changeRelation, checkEmbassy } from '../public/js/sim/diplomacy.js';

test('relazioni iniziali: 30 tra popoli della stessa cultura, 0 altrimenti; simmetriche', () => {
  const g = makeGame();
  assert.equal(relation(g, 'roma', 'latini'), 30);
  assert.equal(relation(g, 'roma', 'volsci'), 0);
  changeRelation(g, 'roma', 'volsci', -250);
  assert.equal(relation(g, 'volsci', 'roma'), -200);
  assert.deepEqual(g.nazioni.roma.alleati, []);
  assert.equal(g.nazioni.roma.protettore, null);
});

test('ambasceria: costa, alza la relazione, una volta l\'anno', () => {
  const g = makeGame();
  g.nazioni.roma.tesoro = 10;
  assert.equal(applyCommand(g, { tipo: 'ambasceria', nazione: 'roma', verso: 'volsci' }).ok, true);
  assert.equal(relation(g, 'roma', 'volsci'), 25);
  assert.equal(g.nazioni.roma.tesoro, 7);
  assert.equal(checkEmbassy(g, 'roma', 'volsci'), 'ambasceria già inviata quest\'anno');
  g.nazioni.roma.tesoro = 1;
  assert.equal(applyCommand(g, { tipo: 'ambasceria', nazione: 'roma', verso: 'latini' }).motivo, 'denaro insufficiente');
});

test('le relazioni tornano verso la base, ma non durante una guerra', () => {
  const g = makeGame();
  changeRelation(g, 'roma', 'siculi', 10);
  for (let i = 0; i < 70; i++) advanceDay(g); // due inizi di mese
  assert.equal(relation(g, 'roma', 'siculi'), 8);
  changeRelation(g, 'roma', 'volsci', 10);
  declareWar(g, 'roma', 'volsci');
  const v = relation(g, 'roma', 'volsci');
  for (let i = 0; i < 70; i++) advanceDay(g);
  assert.equal(relation(g, 'roma', 'volsci'), v);
});

test('pretesto da un rifiuto: vale fino alla scadenza', () => {
  const g = makeGame();
  assert.equal(hasPretext(g, 'roma', 'volsci'), false);
  g.nazioni.roma.pretesti.volsci = g.day + 10;
  assert.equal(hasPretext(g, 'roma', 'volsci'), true);
  g.day += 11;
  assert.equal(hasPretext(g, 'roma', 'volsci'), false);
});
