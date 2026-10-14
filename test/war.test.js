import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf } from '../public/js/sim/state.js';
import { orderMove, advanceMovement } from '../public/js/sim/armies.js';
import {
  declareWar, warscore, scoreFor, peaceCost, makePeace, proposePeace, answerProposal, expireProposals, atWar, validTerms
} from '../public/js/sim/war.js';

function warGame() {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  return { g, w: g.guerre[guerra] };
}

test('punteggio: occupazione pesata sulle tasse più battaglie', () => {
  const { g, w } = warGame();
  assert.equal(warscore(g, w), 0);
  g.province.c.controller = 'roma';
  assert.equal(warscore(g, w), 50);
  w.battaglie = 10;
  assert.equal(warscore(g, w), 60);
  assert.equal(scoreFor(g, w, 'volsci'), -60);
  assert.equal(peaceCost(g, w, 'roma', { province: ['c'] }), 50);
});

test('pace: province, infamia, tregua, nuova capitale', () => {
  const { g, w } = warGame();
  g.province.c.controller = 'roma';
  assert.equal(makePeace(g, w.id, 'roma', { province: ['f'] }).motivo, 'provincia non occupata');
  assert.equal(makePeace(g, w.id, 'roma', { province: ['c'] }).ok, true);
  assert.equal(g.province.c.owner, 'roma');
  assert.equal(g.nazioni.roma.infamia, 4); // 2 + 2 cultura diversa
  assert.equal(g.nazioni.volsci.capitale, 'f');
  assert.equal(g.nazioni.roma.tregue.volsci, g.day + 1825);
  assert.equal(g.nazioni.volsci.tregue.roma, g.day + 1825);
  assert.equal(atWar(g, 'roma', 'volsci'), false);
  assert.deepEqual(g.guerre, {});
});

test('pace: occupazioni restituite ed eserciti rimandati a casa', () => {
  const { g, w } = warGame();
  g.province.b.controller = 'volsci';
  const [v] = armiesOf(g, 'volsci');
  v.prov = 'b';
  makePeace(g, w.id, 'roma', { province: [] });
  assert.equal(g.province.b.controller, 'roma');
  assert.equal(v.prov, 'c');
});

test('pace durante una marcia: l\'esercito non entra in terra ora straniera', () => {
  const { g, w } = warGame();
  const [r] = armiesOf(g, 'roma');
  r.prov = 'b';
  assert.equal(orderMove(g, r.id, 'c').ok, true);
  makePeace(g, w.id, 'roma', { province: [] });
  for (let i = 0; i < 20; i++) advanceMovement(g);
  assert.equal(r.prov, 'b');
  assert.deepEqual(r.percorso, []);
});

test('una nazione senza province viene eliminata e ripulita', () => {
  const { g, w } = warGame();
  g.balance = structuredClone(g.balance); g.balance.guerra.quotaPace = 1; // misura l'eliminazione, non la quota per pace
  g.province.c.controller = 'roma';
  g.province.f.controller = 'roma';
  proposePeace(g, 'volsci', w.id, { ricevente: 'volsci', province: [] });
  makePeace(g, w.id, 'roma', { province: ['c', 'f'] });
  assert.equal(g.nazioni.volsci.vivo, false);
  assert.equal(armiesOf(g, 'volsci').length, 0);
  assert.deepEqual(g.proposte, {});
});

test('proposte: proporre, rifiutare, accettare, scadere', () => {
  const { g, w } = warGame();
  g.province.c.controller = 'roma';
  assert.equal(proposePeace(g, 'roma', w.id, { ricevente: 'latini', province: [] }).motivo, 'ricevente non valido');
  const p1 = proposePeace(g, 'roma', w.id, { ricevente: 'roma', province: ['c'] }).proposta;
  assert.equal(g.proposte[p1].a, 'volsci');
  assert.equal(answerProposal(g, 'roma', p1, true).motivo, 'proposta inesistente'); // non è rivolta a roma
  assert.deepEqual(answerProposal(g, 'volsci', p1, false), { ok: true, accettata: false });
  const p2 = proposePeace(g, 'roma', w.id, { ricevente: 'roma', province: ['c'] }).proposta;
  g.day += 31;
  expireProposals(g);
  assert.equal(g.proposte[p2], undefined);
  const p3 = proposePeace(g, 'roma', w.id, { ricevente: 'roma', province: ['c'] }).proposta;
  assert.deepEqual(answerProposal(g, 'volsci', p3, true), { ok: true, accettata: true });
  assert.equal(g.province.c.owner, 'roma');
});

test('termini di pace malformati: rifiutati senza eccezioni', () => {
  const { g, w } = warGame();
  g.province.c.controller = 'roma';
  for (const termini of [undefined, null, {}, { ricevente: 'roma' }, { ricevente: 'roma', province: 'c' }, { ricevente: 'roma', province: ['c', 'c'] }, { ricevente: 'roma', province: [1] }]) {
    assert.deepEqual(proposePeace(g, 'roma', w.id, termini), { ok: false, motivo: 'termini non validi' });
  }
  assert.equal(makePeace(g, w.id, 'roma', { province: ['c', 'c'] }).motivo, 'termini non validi');
  assert.equal(g.nazioni.roma.infamia, 0);
});

test('una pace non prende più della quota delle province di un popolo', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.guerra.quotaPace = 0.5;
  const { guerra } = declareWar(g, 'roma', 'latini');
  g.province.d.controller = 'roma';
  g.province.e.controller = 'roma';
  const w = g.guerre[guerra];
  assert.equal(validTerms(g, w, 'roma', { province: ['d', 'e'] }), 'troppe province per una pace'); // 2 su 2
  assert.equal(validTerms(g, w, 'roma', { province: ['d'] }), null);
  g.balance.guerra.quotaPace = 1;
  assert.equal(validTerms(g, w, 'roma', { province: ['d', 'e'] }), null);
});

test('un popolo con una provincia sola può perderla (quota minima una)', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.guerra.quotaPace = 0.5;
  const { guerra } = declareWar(g, 'volsci', 'siculi');
  g.province.g.controller = 'volsci';
  assert.equal(validTerms(g, g.guerre[guerra], 'volsci', { province: ['g'] }), null);
});
