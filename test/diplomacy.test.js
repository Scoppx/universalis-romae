import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { advanceDay } from '../public/js/sim/loop.js';
import { declareWar, hasPretext } from '../public/js/sim/war.js';
import { relation, changeRelation, checkEmbassy, checkProposal, allied, monthlyDiplomacy, coalition } from '../public/js/sim/diplomacy.js';
import { createArmy } from '../public/js/sim/state.js';

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

const proponi = (g, da, genere, verso, extra = {}) => applyCommand(g, { tipo: 'proponi', nazione: da, genere, verso, ...extra });
const rispondi = (g, chi, proposta, accetta) => applyCommand(g, { tipo: 'rispondi', nazione: chi, proposta, accetta });

test('alleanza: proposta, accettazione, rottura', () => {
  const g = makeGame();
  const { proposta } = proponi(g, 'roma', 'alleanza', 'latini');
  assert.equal(proponi(g, 'roma', 'alleanza', 'latini').motivo, 'proposta già in attesa');
  assert.deepEqual(rispondi(g, 'latini', proposta, true), { ok: true, accettata: true });
  assert.equal(allied(g, 'roma', 'latini'), true);
  assert.equal(checkProposal(g, 'roma', 'alleanza', 'latini'), 'siete già alleati');
  assert.equal(applyCommand(g, { tipo: 'dichiara_guerra', nazione: 'roma', contro: 'latini' }).motivo, 'siete alleati');
  const prima = relation(g, 'roma', 'latini');
  assert.equal(applyCommand(g, { tipo: 'rompi_alleanza', nazione: 'roma', con: 'latini' }).ok, true);
  assert.equal(allied(g, 'latini', 'roma'), false);
  assert.equal(relation(g, 'roma', 'latini'), prima - 25);
});

test('foedus: solo a un vicino molto più debole e amico; il federato non dichiara guerre', () => {
  const g = makeGame();
  assert.equal(checkProposal(g, 'roma', 'foedus', 'volsci'), 'non abbastanza più forte');
  createArmy(g, 'roma', 'a', 20000, 0);
  assert.equal(checkProposal(g, 'roma', 'foedus', 'volsci'), 'relazioni troppo basse');
  changeRelation(g, 'roma', 'volsci', 60);
  const { proposta } = proponi(g, 'roma', 'foedus', 'volsci');
  rispondi(g, 'volsci', proposta, true);
  assert.equal(g.nazioni.volsci.protettore, 'roma');
  assert.equal(applyCommand(g, { tipo: 'dichiara_guerra', nazione: 'volsci', contro: 'siculi' }).motivo, 'un federato non dichiara guerre');
  assert.equal(checkProposal(g, 'volsci', 'alleanza', 'siculi'), 'un federato non stringe alleanze');
  g.nazioni.volsci.uomini = 1000;
  while (g.day !== 10) advanceDay(g); // 1 maggio: reclute del mese (75), il 20% (15) va a Roma
  assert.equal(g.nazioni.volsci.uomini, 1000 + 75 - 15);
});

test('tributo: rifiutato dà un pretesto, accettato si paga ogni mese', () => {
  const g = makeGame();
  const p1 = proponi(g, 'roma', 'tributo', 'volsci').proposta;
  rispondi(g, 'volsci', p1, false);
  assert.equal(g.nazioni.roma.pretesti.volsci, g.day + 5 * 365);
  const p2 = proponi(g, 'roma', 'tributo', 'latini').proposta;
  rispondi(g, 'latini', p2, true);
  assert.deepEqual(g.nazioni.latini.tributo, { a: 'roma', fine: g.day + 10 * 365 });
  const tr = g.nazioni.roma.tesoro, tl = g.nazioni.latini.tesoro;
  monthlyDiplomacy(g); // il 20% delle entrate latine (5 × 0,1 = 0,5) passa a Roma
  assert.ok(Math.abs(g.nazioni.roma.tesoro - tr - 0.1) < 1e-9);
  assert.ok(Math.abs(tl - g.nazioni.latini.tesoro - 0.1) < 1e-9);
});

test('ultimatum: provincia ceduta con infamia; non vale più se la provincia cambia padrone', () => {
  const g = makeGame();
  assert.equal(checkProposal(g, 'roma', 'ultimatum', 'latini', { provincia: 'a' }), 'provincia non valida');
  const p = proponi(g, 'roma', 'ultimatum', 'latini', { provincia: 'e' }).proposta;
  rispondi(g, 'latini', p, true);
  assert.equal(g.province.e.owner, 'roma');
  assert.ok(g.nazioni.roma.infamia >= 2);
  assert.equal(checkProposal(g, 'roma', 'ultimatum', 'latini', { provincia: 'd' }), 'è la sua ultima provincia');
  const q = proponi(g, 'roma', 'ultimatum', 'volsci', { provincia: 'c' }).proposta;
  g.province.c.owner = 'latini';
  assert.equal(rispondi(g, 'volsci', q, true).ok, false);
  assert.equal(g.province.c.owner, 'latini');
});

const allea = (g, a, b) => rispondi(g, b, proponi(g, a, 'alleanza', b).proposta, true);

test('difesa: gli alleati del difensore entrano da soli, quelli amici dell\'attaccante no', () => {
  const g = makeGame();
  allea(g, 'volsci', 'siculi');
  allea(g, 'volsci', 'latini');
  allea(g, 'roma', 'latini'); // latini alleati di entrambi: restano fuori
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.deepEqual(g.guerre[guerra].difensori, ['volsci', 'siculi']);
  assert.ok(relation(g, 'roma', 'siculi') <= -100);
});

test('attacco: gli alleati dell\'attaccante sono chiamati; chi rifiuta rompe l\'alleanza', () => {
  const g = makeGame();
  allea(g, 'roma', 'siculi');
  allea(g, 'roma', 'latini');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  const chiamate = Object.values(g.proposte).filter(p => p.tipo === 'chiamata' && p.guerra === guerra);
  assert.deepEqual(chiamate.map(p => p.a).sort(), ['latini', 'siculi']);
  rispondi(g, 'siculi', chiamate.find(p => p.a === 'siculi').id, true);
  assert.deepEqual(g.guerre[guerra].attaccanti, ['roma', 'siculi']);
  rispondi(g, 'latini', chiamate.find(p => p.a === 'latini').id, false);
  assert.equal(allied(g, 'roma', 'latini'), false);
});

test('chiamata per una guerra già finita: non vale', () => {
  const g = makeGame();
  allea(g, 'roma', 'siculi');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  const ch = Object.values(g.proposte).find(p => p.tipo === 'chiamata');
  delete g.guerre[guerra];
  assert.equal(rispondi(g, 'siculi', ch.id, true).ok, false);
});

test('coalizione: chi ha troppa infamia trova i vicini ostili uniti', () => {
  const g = makeGame();
  g.nazioni.roma.infamia = 25;
  changeRelation(g, 'roma', 'latini', -80);
  changeRelation(g, 'roma', 'volsci', -10);
  assert.deepEqual(coalition(g, 'roma'), ['latini', 'volsci']);
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.deepEqual(g.guerre[guerra].difensori, ['volsci', 'latini']);
});

test('alleati: passano nelle terre amiche e combattono dalla stessa parte', async () => {
  const { findPath } = await import('../public/js/sim/armies.js');
  const { resolveBattles } = await import('../public/js/sim/combat.js');
  const g = makeGame();
  allea(g, 'roma', 'latini');
  assert.equal(findPath(g, 'roma', 'a', 'e').at(-1), 'e');
  assert.deepEqual(findPath(g, 'roma', 'a', 'd'), ['d']);
  for (const a of Object.values(g.eserciti)) delete g.eserciti[a.id];
  const { guerra } = declareWar(g, 'volsci', 'roma');
  assert.deepEqual(g.guerre[guerra].difensori, ['roma', 'latini']);
  const r = createArmy(g, 'roma', 'b', 1000, 0), l = createArmy(g, 'latini', 'b', 1000, 0), v = createArmy(g, 'volsci', 'b', 1000, 0);
  resolveBattles(g);
  assert.deepEqual([r.inBattaglia, l.inBattaglia, v.inBattaglia], [true, true, true]);
});

test('popolo eliminato: alleanze, foedus e tributi ripuliti', async () => {
  const { makePeace } = await import('../public/js/sim/war.js');
  const g = makeGame();
  allea(g, 'volsci', 'siculi');
  g.nazioni.latini.tributo = { a: 'volsci', fine: 9999 };
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.guerre[guerra].difensori = ['volsci']; // i siculi restano fuori per questo test
  g.province.c.controller = 'roma';
  g.province.f.controller = 'roma';
  makePeace(g, guerra, 'roma', { province: ['c', 'f'] });
  assert.equal(g.nazioni.volsci.vivo, false);
  assert.deepEqual(g.nazioni.siculi.alleati, []);
  assert.equal(g.nazioni.latini.tributo, null);
});
