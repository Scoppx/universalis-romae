import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { createArmy } from '../public/js/sim/state.js';
import { declareWar } from '../public/js/sim/war.js';
import { siegeChance, advanceSieges, garrison, siegeRate, daysLeft, assaultChance, checkAssault, siegeInfo } from '../public/js/sim/siege.js';
import { applyCommand } from '../public/js/sim/commands.js';

function setup() {
  const g = makeGame();
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  return g;
}

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('giorni d\'assedio: più uomini meno giorni, presidio e fortificazione allungano', () => {
  const g = setup();
  const c = g.province.c;
  c.uomini = 2; c.fort = 0;
  const base = siegeRate(g, 'roma', 5000, c);
  close(base, 100 * g.balance.assedio.base * 5 * g.balance.assedio.presidioRiferimento / garrison(g, c));
  assert.ok(siegeRate(g, 'roma', 10000, c) > base);              // più uomini
  c.uomini = 4;
  assert.ok(siegeRate(g, 'roma', 5000, c) < base);               // presidio più grande
  c.uomini = 2; c.fort = 2;
  assert.ok(siegeRate(g, 'roma', 5000, c) < base);               // fortificazione più alta
  c.fort = 0;
  g.nazioni.roma.tratti.assedio = -0.5;
  close(siegeRate(g, 'roma', 5000, c), base / 2);                // tratto
  g.nazioni.roma.tratti.assedio = 0;
  close(siegeRate(g, 'roma', 1e7, c), 100 * g.balance.assedio.massimo); // tetto
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

test('assalto: probabilità da uomini, presidio e fortificazione', () => {
  const g = setup();
  declareWar(g, 'roma', 'volsci');
  g.province.c.uomini = 2; g.province.c.fort = 1; // presidio 1000
  createArmy(g, 'roma', 'c', 6000, 0);
  close(assaultChance(g, 'roma', g.province.c), 6000 / (6000 + 1000 * 3));
  assert.equal(checkAssault(g, 'latini', 'c'), 'nessun tuo esercito fermo qui');
  createArmy(g, 'volsci', 'c', 100, 0);
  assert.equal(checkAssault(g, 'roma', 'c'), 'ci sono nemici nella provincia');
});

test('assalto: vittoria prende la provincia con perdite, sconfitta costa uomini e morale', () => {
  const prova = rng => {
    const g = setup();
    g.rng = rng;
    declareWar(g, 'roma', 'volsci');
    g.province.c.uomini = 2; g.province.c.fort = 1;
    const a = createArmy(g, 'roma', 'c', 3000, 0);
    const r = applyCommand(g, { tipo: 'assalto', nazione: 'roma', provincia: 'c' });
    return { g, a, r };
  };
  let vinto = null, perso = null;
  for (let rng = 1; rng < 200 && (!vinto || !perso); rng++) {
    const x = prova(rng);
    if (x.r.vinto) vinto ??= x; else perso ??= x;
  }
  assert.equal(vinto.g.province.c.controller, 'roma');
  assert.equal(vinto.a.fanteria, 3000 - 500); // metà del presidio
  assert.ok(vinto.g.log.some(e => e.tipo === 'assalto' && e.vinto));
  assert.equal(perso.g.province.c.controller, 'volsci');
  assert.equal(perso.a.fanteria, 2400); // −20%
  assert.equal(perso.a.morale, 0);
});

test('l\'IA dà l\'assalto solo con almeno il 75% di probabilità', async () => {
  const { armyOrders } = await import('../public/js/ai/rules.js');
  const g = setup();
  declareWar(g, 'roma', 'volsci');
  g.province.c.uomini = 2; g.province.c.fort = 1;
  const a = createArmy(g, 'roma', 'c', 6000, 0); // 6000 / 9000 = 67%
  assert.ok(!armyOrders(g, 'roma').some(c => c.tipo === 'assalto'));
  a.fanteria = 9000; // 9000 / 12000 = 75%
  assert.deepEqual(armyOrders(g, 'roma').filter(c => c.tipo === 'assalto'), [{ tipo: 'assalto', nazione: 'roma', provincia: 'c' }]);
});

test('assedio con più popoli dello stesso schieramento: uomini sommati, punti conservati quando cambia chi guida', () => {
  const g = setup();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.guerre[guerra].attaccanti.push('latini'); // nello schieramento, ma non alleati di roma
  createArmy(g, 'roma', 'c', 5000, 0);
  advanceSieges(g);
  const punti = g.province.c.assedio.punti;
  assert.ok(punti > 0);
  createArmy(g, 'latini', 'c', 6000, 0);
  const info = siegeInfo(g, g.province.c);
  assert.equal(info.uomini, 11000);
  assert.equal(info.capo, 'roma'); // chi ha iniziato l'assedio resta alla guida
  assert.equal(info.punti, punti);
});

test('la provincia va a chi ha iniziato l\'assedio, anche se poi arriva un alleato più numeroso', () => {
  const g = setup();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.guerre[guerra].attaccanti.push('latini');
  createArmy(g, 'roma', 'c', 3000, 0);
  advanceSieges(g);
  createArmy(g, 'latini', 'c', 9000, 0);
  assert.equal(siegeInfo(g, g.province.c).capo, 'roma');
  for (let i = 0; i < 200 && g.province.c.controller === 'volsci'; i++) advanceSieges(g);
  assert.equal(g.province.c.controller, 'roma');
});
