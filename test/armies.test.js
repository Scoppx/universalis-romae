import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf } from '../public/js/sim/state.js';
import { declareWar, atWar } from '../public/js/sim/war.js';
import { travelDays, findPath, orderMove, advanceMovement, recruit } from '../public/js/sim/armies.js';

test('dichiarare guerra: regole e costo senza pretesto', () => {
  const g = makeGame();
  assert.equal(declareWar(g, 'roma', 'siculi').motivo, 'nessun confine');
  assert.equal(declareWar(g, 'roma', 'volsci').ok, true);
  assert.equal(g.nazioni.roma.stabilita, -2);
  assert.equal(atWar(g, 'volsci', 'roma'), true);
  assert.equal(atWar(g, 'roma', 'latini'), false);
  assert.equal(declareWar(g, 'roma', 'volsci').motivo, 'già in guerra');
  g.nazioni.latini.tregue.roma = g.day + 10;
  assert.equal(declareWar(g, 'latini', 'roma').motivo, 'tregua in corso');
});

test('con pretesto (infamia del nemico sopra soglia) non si perde stabilità', () => {
  const g = makeGame();
  g.nazioni.volsci.infamia = 25;
  declareWar(g, 'roma', 'volsci');
  assert.equal(g.nazioni.roma.stabilita, 0);
});

test('giorni di viaggio: terreno di arrivo più stretto', () => {
  const g = makeGame();
  assert.equal(travelDays(g, 'a', 'b'), 10);
  assert.equal(travelDays(g, 'f', 'g'), 8 + 6);
});

test('percorsi: territorio straniero solo in guerra', () => {
  const g = makeGame();
  assert.equal(findPath(g, 'roma', 'a', 'c'), null);
  declareWar(g, 'roma', 'volsci');
  assert.deepEqual(findPath(g, 'roma', 'a', 'c'), ['b', 'c']);
  assert.deepEqual(findPath(g, 'roma', 'a', 'a'), []);
});

test('ordine verso provincia irraggiungibile: rifiutato, stato invariato', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  const before = JSON.stringify(g);
  assert.deepEqual(orderMove(g, r.id, 'c'), { ok: false, motivo: 'nessun percorso' });
  assert.equal(JSON.stringify(g), before);
});

test('movimento: arriva dopo i giorni del terreno', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  assert.equal(orderMove(g, r.id, 'b').ok, true);
  for (let i = 0; i < 9; i++) advanceMovement(g);
  assert.equal(r.prov, 'a');
  advanceMovement(g);
  assert.equal(r.prov, 'b');
  assert.deepEqual(r.percorso, []);
});

test('reclutamento: costi, unione con esercito fermo, errori', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  const res = recruit(g, 'roma', 'a', 1000, 0);
  assert.equal(res.ok, true);
  assert.equal(res.esercito, r.id);
  assert.equal(r.fanteria, 3340);
  assert.equal(g.nazioni.roma.uomini, 950);
  assert.equal(recruit(g, 'roma', 'a', 1000, 0).motivo, 'denaro insufficiente');
  assert.equal(recruit(g, 'roma', 'c', 100, 0).motivo, 'provincia non tua');
  assert.equal(recruit(g, 'roma', 'a', -5, 0).motivo, 'numeri non validi');
  assert.equal(recruit(g, 'roma', 'a', 10.5, 0).motivo, 'numeri non validi');
  g.nazioni.roma.tesoro = 100;
  assert.equal(recruit(g, 'roma', 'b', 500, 0).ok, true);
  assert.equal(armiesOf(g, 'roma').length, 2);
});
