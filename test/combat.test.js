import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf, createArmy } from '../public/js/sim/state.js';
import { declareWar } from '../public/js/sim/war.js';
import { resolveBattles, recoverMorale, checkRetreat, nearestSafe } from '../public/js/sim/combat.js';
import { applyCommand } from '../public/js/sim/commands.js';

function setup(seed = 1) {
  const g = makeGame(seed);
  const { guerra } = declareWar(g, 'roma', 'volsci');
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  return { g, w: g.guerre[guerra] };
}

function fight(g, max = 100) {
  for (let i = 0; i < max; i++) {
    resolveBattles(g);
    if (g.log.some(e => e.tipo === 'battaglia')) return g.log.find(e => e.tipo === 'battaglia');
  }
  return null;
}

test('il più forte vince e conta per il punteggio', () => {
  const { g, w } = setup();
  createArmy(g, 'roma', 'b', 10000, 0);
  createArmy(g, 'volsci', 'b', 1000, 0);
  const b = fight(g);
  assert.equal(b.vincitore, 'roma');
  assert.equal(w.battaglie, 2);
  assert.ok(armiesOf(g, 'volsci').every(a => a.prov !== 'b'));
});

test('niente battaglia tra chi non è in guerra', () => {
  const { g } = setup();
  createArmy(g, 'roma', 'b', 1000, 0);
  createArmy(g, 'latini', 'b', 1000, 0);
  resolveBattles(g);
  assert.ok(Object.values(g.eserciti).every(a => !a.inBattaglia));
});

test('il difensore in montagna vince più spesso a parità di forze', () => {
  let volsci = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const { g } = setup(seed);
    createArmy(g, 'roma', 'c', 5000, 0);
    createArmy(g, 'volsci', 'c', 5000, 0);
    if (fight(g)?.vincitore === 'volsci') volsci++;
  }
  assert.ok(volsci / 300 > 0.6, `volsci ha vinto ${volsci}/300`);
});

test('ritirata impossibile: l\'esercito si scioglie', () => {
  const { g } = setup();
  g.province.f.controller = 'roma';
  createArmy(g, 'roma', 'c', 20000, 0);
  createArmy(g, 'volsci', 'c', 2000, 0);
  fight(g);
  assert.equal(armiesOf(g, 'volsci').length, 0);
});

test('ritirata verso la provincia propria sicura più vicina', () => {
  const { g } = setup();
  createArmy(g, 'roma', 'c', 6000, 0);
  const v = createArmy(g, 'volsci', 'c', 3000, 0);
  fight(g);
  if (g.eserciti[v.id]) {
    assert.equal(v.prov, 'f');
    assert.equal(v.morale, 0);
  }
});

test('il morale si recupera fuori dalla battaglia, con tetto', () => {
  const { g } = setup();
  const a = createArmy(g, 'roma', 'a', 1000, 0);
  a.morale = 2.98;
  recoverMorale(g);
  assert.equal(a.morale, 3);
});

test('con tre nazioni nella provincia combattono le due in guerra', () => {
  const { g } = setup();
  for (const w of Object.keys(g.guerre)) delete g.guerre[w];
  declareWar(g, 'roma', 'latini');
  declareWar(g, 'volsci', 'latini');
  declareWar(g, 'siculi', 'volsci');
  const r = createArmy(g, 'roma', 'e', 1000, 0);
  const v = createArmy(g, 'volsci', 'e', 1000, 0);
  const s = createArmy(g, 'siculi', 'e', 1000, 0);
  resolveBattles(g);
  assert.equal(r.inBattaglia, false);
  assert.equal(v.inBattaglia, true);
  assert.equal(s.inBattaglia, true);
});

test('ritirata dalla battaglia: −10%, morale a zero, verso la provincia sicura, battaglia persa', () => {
  const { g, w } = setup();
  const r = createArmy(g, 'roma', 'b', 5000, 0);
  createArmy(g, 'volsci', 'b', 5000, 0);
  resolveBattles(g);
  assert.equal(r.inBattaglia, true);
  assert.equal(checkRetreat(g, 'latini', 'b'), 'nessun tuo esercito in battaglia qui');
  const prima = r.fanteria;
  assert.deepEqual(applyCommand(g, { tipo: 'ritirata', nazione: 'roma', provincia: 'b' }), { ok: true });
  assert.equal(r.fanteria, Math.round(prima * 0.9));
  assert.equal(r.morale, 0);
  assert.equal(r.prov, 'a');
  assert.equal(w.battaglie, -2); // conta come vinta dai volsci (difensori)
  assert.ok(g.log.some(e => e.tipo === 'ritirata' && e.nazione === 'roma'));
});

test('ripiego dall\'assedio: marcia verso la provincia sicura più vicina', () => {
  const { g } = setup();
  const r = createArmy(g, 'roma', 'c', 3000, 0);
  assert.equal(nearestSafe(g, 'roma', 'c'), 'b');
  assert.deepEqual(applyCommand(g, { tipo: 'ripiega', nazione: 'roma', provincia: 'c' }), { ok: true, verso: 'b' });
  assert.deepEqual(r.percorso, ['b']);
  r.percorso = []; // di nuovo fermo, per provare il caso senza province sicure
  g.province.a.owner = 'latini'; g.province.b.owner = 'latini'; // roma senza province
  assert.equal(applyCommand(g, { tipo: 'ripiega', nazione: 'roma', provincia: 'c' }).motivo, 'nessuna provincia sicura raggiungibile');
});

test('ripiego: solo verso una provincia sicura che si può raggiungere', () => {
  const g = makeGame();
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  declareWar(g, 'roma', 'siculi'); // non confinano: per tornare bisogna passare dai volsci, che non sono in guerra
  createArmy(g, 'roma', 'g', 3000, 0);
  assert.equal(applyCommand(g, { tipo: 'ripiega', nazione: 'roma', provincia: 'g' }).motivo, 'nessuna provincia sicura raggiungibile');
});
