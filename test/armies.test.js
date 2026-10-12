import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf, createArmy } from '../public/js/sim/state.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { declareWar, atWar } from '../public/js/sim/war.js';
import { travelDays, findPath, orderMove, advanceMovement, recruit, mergeArmies, splitArmy } from '../public/js/sim/armies.js';

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

test('unisci: stessi uomini, morale medio pesato, un solo esercito', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  const b = createArmy(g, 'roma', 'a', 1000, 100);
  r.morale = 3; b.morale = 1;
  const tot = r.fanteria + r.cavalleria + 1100;
  const res = mergeArmies(g, 'roma', [r.id, b.id]);
  assert.deepEqual(res, { ok: true, esercito: r.id });
  assert.equal(armiesOf(g, 'roma').length, 1);
  assert.equal(r.fanteria + r.cavalleria, tot);
  assert.ok(Math.abs(r.morale - (3 * (tot - 1100) + 1 * 1100) / tot) < 1e-9);
});

test('unisci: rifiuti', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  const b = createArmy(g, 'roma', 'b', 1000, 0);
  const [v] = armiesOf(g, 'volsci');
  assert.equal(mergeArmies(g, 'roma', [r.id]).motivo, 'servono almeno due eserciti');
  assert.equal(mergeArmies(g, 'roma', [r.id, b.id]).motivo, 'non sono nella stessa provincia');
  assert.equal(mergeArmies(g, 'roma', [r.id, v.id]).motivo, 'esercito non tuo');
  b.prov = 'a'; b.percorso = ['b'];
  assert.equal(mergeArmies(g, 'roma', [r.id, b.id]).motivo, 'eserciti in marcia o in battaglia');
});

test('dividi: due metà con lo stesso morale; troppo piccolo no', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  r.morale = 2;
  const res = splitArmy(g, 'roma', r.id);
  assert.equal(res.ok, true);
  const n = g.eserciti[res.esercito];
  assert.deepEqual([r.fanteria, n.fanteria, r.cavalleria, n.cavalleria], [1170, 1170, 117, 117]);
  assert.equal(n.morale, 2);
  assert.equal(n.prov, r.prov);
  const p = createArmy(g, 'roma', 'b', 150, 0);
  assert.equal(splitArmy(g, 'roma', p.id).motivo, 'esercito troppo piccolo');
  assert.equal(applyCommand(g, { tipo: 'dividi', nazione: 'roma', esercito: r.id }).ok, true);
  assert.equal(applyCommand(g, { tipo: 'unisci', nazione: 'roma', eserciti: [r.id, res.esercito] }).ok, true);
});
