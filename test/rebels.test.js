import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { loadData } from '../tools/load-data.js';
import { RIBELLI, createArmy, armiesOf, provincesOf } from '../public/js/sim/state.js';
import { atWar, declareWar } from '../public/js/sim/war.js';
import { resolveBattles } from '../public/js/sim/combat.js';
import { advanceSieges } from '../public/js/sim/siege.js';
import { monthlyCulture, ensureRebels, independence } from '../public/js/sim/culture.js';
import { armyOrders, rulesController } from '../public/js/ai/rules.js';
import { createSession, runDays } from '../public/js/ui/session.js';

function conBilancio(g) { g.balance = structuredClone(g.balance); return g; }
function soloRibelli(g, prov, uomini = 2000) {
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  ensureRebels(g);
  return createArmy(g, RIBELLI, prov, uomini, 0);
}

test('rivolta: oltre la soglia nasce un esercito ribelle nella provincia', () => {
  const g = conBilancio(makeGame());
  g.province.b.cultura = 'volsca';
  monthlyCulture(g); // malcontento 3: niente rivolta
  assert.ok(!Object.values(g.eserciti).some(a => a.owner === RIBELLI));
  g.nazioni.roma.stabilita = -1;
  g.balance.cultura.rivoltaPerPunto = 1; // certa
  monthlyCulture(g);
  const r = Object.values(g.eserciti).filter(a => a.owner === RIBELLI);
  assert.equal(r.length, 1);
  assert.equal(r[0].prov, 'b');
  assert.equal(r[0].fanteria, 2 * 400);
  assert.ok(g.log.some(e => e.tipo === 'rivolta' && e.prov === 'b' && e.nazione === 'roma'));
  monthlyCulture(g); // un esercito ribelle già presente: nessuna seconda rivolta
  assert.equal(Object.values(g.eserciti).filter(a => a.owner === RIBELLI).length, 1);
  assert.equal(g.ordine.includes(RIBELLI), false);
});

test('i ribelli sono in guerra con tutti, combattono e si sciolgono se battuti', () => {
  const g = makeGame();
  assert.equal(atWar(g, 'roma', RIBELLI), true);
  assert.equal(atWar(g, RIBELLI, RIBELLI), false);
  soloRibelli(g, 'b', 500);
  createArmy(g, 'roma', 'b', 5000, 0);
  for (let i = 0; i < 100 && armiesOf(g, RIBELLI).length; i++) resolveBattles(g);
  assert.equal(armiesOf(g, RIBELLI).length, 0);
});

test('un alleato combatte i ribelli insieme al padrone', () => {
  const g = makeGame();
  soloRibelli(g, 'b', 3000);
  g.nazioni.roma.alleati.push('latini'); g.nazioni.latini.alleati.push('roma');
  const r = createArmy(g, 'roma', 'b', 1000, 0), l = createArmy(g, 'latini', 'b', 1000, 0);
  resolveBattles(g);
  assert.equal(r.inBattaglia, true);
  assert.equal(l.inBattaglia, true);
});

test('assedio dei ribelli; riconquista: al padrone se la libera un alleato, al nemico del padrone se la prende lui', () => {
  const g = makeGame();
  const ribelli = soloRibelli(g, 'b', 20000);
  for (let i = 0; i < 2000 && g.province.b.controller !== RIBELLI; i++) { g.day++; advanceSieges(g); }
  assert.equal(g.province.b.controller, RIBELLI);
  assert.equal(g.province.b.ribelliDal, g.day);
  delete g.eserciti[ribelli.id];
  g.nazioni.roma.alleati.push('latini'); g.nazioni.latini.alleati.push('roma');
  createArmy(g, 'latini', 'b', 20000, 0);
  for (let i = 0; i < 2000 && g.province.b.controller === RIBELLI; i++) advanceSieges(g);
  assert.equal(g.province.b.controller, 'roma');
  assert.equal(g.province.b.ribelliDal, null);
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  g.province.b.controller = RIBELLI;
  declareWar(g, 'volsci', 'roma');
  createArmy(g, 'volsci', 'b', 20000, 0);
  for (let i = 0; i < 2000 && g.province.b.controller === RIBELLI; i++) advanceSieges(g);
  assert.equal(g.province.b.controller, 'volsci');
});

test('indipendenza dopo un anno: va al vicino della stessa cultura', () => {
  const g = makeGame();
  const r = soloRibelli(g, 'b');
  g.day = 1000;
  g.province.b.controller = RIBELLI;
  g.province.b.ribelliDal = 1000 - 365;
  monthlyCulture(g);
  assert.equal(g.province.b.owner, 'latini'); // b è latina e confina con i latini (e)
  assert.equal(g.province.b.controller, 'latini');
  assert.equal(g.eserciti[r.id].owner, 'latini');
  assert.ok(g.log.some(e => e.tipo === 'indipendenza' && e.prov === 'b' && e.da === 'roma' && e.a === 'latini'));
});

test('indipendenza senza vicini della stessa cultura: nasce un popolo nuovo, con tregua', () => {
  const g = makeGame();
  const r = soloRibelli(g, 'b');
  g.province.b.cultura = 'etrusca';
  g.province.b.controller = RIBELLI;
  independence(g, 'b');
  const nuovo = g.province.b.owner;
  assert.match(nuovo, /^liberi_b_\d+$/);
  const n = g.nazioni[nuovo];
  assert.equal(n.nome, 'Liberi di B');
  assert.equal(n.cultura, 'etrusca');
  assert.equal(n.capitale, 'b');
  assert.equal(n.vivo, true);
  assert.ok(g.ordine.includes(nuovo));
  assert.deepEqual(n.slider, { societa: 0, guerra: 0, governo: 0 });
  assert.equal(typeof n.relazioni.roma, 'number');
  assert.equal(typeof g.nazioni.roma.relazioni[nuovo], 'number');
  assert.ok(n.tregue.roma > g.day && g.nazioni.roma.tregue[nuovo] > g.day);
  assert.equal(g.eserciti[r.id].owner, nuovo);
  assert.equal(provincesOf(g, nuovo).length, 1);
});

test('l\'ultima provincia persa per indipendenza elimina il popolo', () => {
  const g = makeGame();
  soloRibelli(g, 'g');
  g.province.g.controller = RIBELLI;
  independence(g, 'g');
  assert.equal(g.nazioni.siculi.vivo, false);
});

test('regole: in pace gli eserciti vanno contro i ribelli nelle proprie terre', () => {
  const g = makeGame();
  ensureRebels(g);
  createArmy(g, RIBELLI, 'b', 500, 0);
  const cmds = armyOrders(g, 'roma');
  assert.ok(cmds.some(c => c.tipo === 'muovi' && c.verso === 'b'), JSON.stringify(cmds));
});

test('un popolo nato a metà partita riceve un controller', () => {
  const s = createSession(loadData(), 'roma', 1);
  const p = Object.values(s.game.province).find(x => x.owner !== 'roma' && provincesOf(s.game, x.owner).length > 1);
  p.cultura = 'nessuna_cultura';
  ensureRebels(s.game);
  p.controller = RIBELLI;
  independence(s.game, p.id);
  const nuovo = p.owner;
  runDays(s, 1);
  assert.equal(s.controllers[nuovo], rulesController);
});

test('un popolo nato da un\'indipendenza ha tregua con i confinanti e un esercito più grande', () => {
  const g = makeGame();
  const r = soloRibelli(g, 'b', 1000);
  g.province.b.cultura = 'etrusca';
  g.province.b.controller = RIBELLI;
  independence(g, 'b');
  const nuovo = g.province.b.owner;
  for (const o of ['roma', 'latini', 'volsci']) assert.ok(g.nazioni[nuovo].tregue[o] > g.day && g.nazioni[o].tregue[nuovo] > g.day, o);
  assert.equal(g.eserciti[r.id].fanteria, Math.round(1000 * g.balance.nuoviPopoli.esercito));
});
