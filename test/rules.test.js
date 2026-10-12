import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf } from '../public/js/sim/state.js';
import { declareWar, proposePeace } from '../public/js/sim/war.js';
import { advanceDay } from '../public/js/sim/loop.js';
import {
  rulesController, warCandidates, strategy, answerProposals, armyOrders, recruitment
} from '../public/js/ai/rules.js';

const allRules = g => Object.fromEntries(g.ordine.map(id => [id, rulesController]));

test('candidati di guerra: confinanti, fuori tregua, per rapporto di forze', () => {
  const g = makeGame();
  assert.deepEqual(warCandidates(g, 'roma').map(c => c.id), ['volsci', 'latini']);
  g.nazioni.roma.tregue.volsci = 999;
  assert.deepEqual(warCandidates(g, 'roma').map(c => c.id), ['latini']);
});

test('strategia: attacca il più debole se il rapporto basta e la stabilità regge', () => {
  const g = makeGame();
  assert.deepEqual(strategy(g, 'roma'), [{ tipo: 'dichiara_guerra', nazione: 'roma', contro: 'volsci' }]);
  g.nazioni.roma.stabilita = -1;
  assert.deepEqual(strategy(g, 'roma'), []);
  g.nazioni.roma.stabilita = 0;
  g.nazioni.roma.infamia = 20;
  assert.deepEqual(strategy(g, 'roma'), []);
});

test('strategia in guerra: chiede le province occupate che il punteggio copre', () => {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  assert.deepEqual(strategy(g, 'roma'), [
    { tipo: 'proponi_pace', nazione: 'roma', guerra, termini: { ricevente: 'roma', province: ['c'] } }
  ]);
  proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'] });
  assert.deepEqual(strategy(g, 'roma'), []); // già in attesa
});

test('risposte: accetta guadagni, cede solo se il nemico vince abbastanza', () => {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  const p = proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'] }).proposta;
  assert.deepEqual(answerProposals(g, 'volsci'), [{ tipo: 'rispondi', nazione: 'volsci', proposta: p, accetta: true }]);
  delete g.proposte[p];
  g.guerre[guerra].battaglie = -25; // punteggio roma 25: cedere c (50) non è giustificato
  const p2 = proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'] }).proposta;
  assert.deepEqual(answerProposals(g, 'volsci'), [{ tipo: 'rispondi', nazione: 'volsci', proposta: p2, accetta: false }]);
});

test('eserciti: in guerra vanno verso la provincia nemica più vicina, in pace a casa', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  r.prov = 'b';
  assert.deepEqual(armyOrders(g, 'roma'), [{ tipo: 'muovi', nazione: 'roma', esercito: r.id, verso: 'a' }]);
  r.prov = 'a';
  declareWar(g, 'roma', 'volsci');
  assert.deepEqual(armyOrders(g, 'roma'), [{ tipo: 'muovi', nazione: 'roma', esercito: r.id, verso: 'c' }]);
});

test('reclutamento: sotto obiettivo, con uomini e denaro', () => {
  const g = makeGame();
  assert.deepEqual(recruitment(g, 'roma'), [
    { tipo: 'recluta', nazione: 'roma', provincia: 'a', fanteria: 450, cavalleria: 50 }
  ]);
  g.nazioni.roma.tesoro = 0;
  assert.deepEqual(recruitment(g, 'roma'), []);
});

test('determinismo: stesso seme, stessa partita', () => {
  const a = makeGame(7), b = makeGame(7);
  for (let i = 0; i < 365 * 20; i++) { advanceDay(a, allRules(a)); advanceDay(b, allRules(b)); }
  assert.deepEqual(a, b);
});

test('salvataggio e ricarica a metà partita proseguono identici', () => {
  const a = makeGame(3);
  for (let i = 0; i < 365 * 5; i++) advanceDay(a, allRules(a));
  const b = JSON.parse(JSON.stringify(a));
  for (let i = 0; i < 365 * 5; i++) { advanceDay(a, allRules(a)); advanceDay(b, allRules(b)); }
  assert.deepEqual(a, b);
});

test('invarianti dopo 50 anni', () => {
  const g = makeGame(11);
  for (let i = 0; i < 365 * 50; i++) advanceDay(g, allRules(g));
  for (const p of Object.values(g.province)) assert.ok(g.nazioni[p.owner].vivo, `${p.id} di nazione morta`);
  for (const a of Object.values(g.eserciti)) {
    assert.ok(g.nazioni[a.owner].vivo);
    assert.ok(a.fanteria >= 0 && a.cavalleria >= 0);
    assert.ok(a.morale >= 0 && a.morale <= 3);
  }
  for (const n of Object.values(g.nazioni)) assert.ok(Number.isFinite(n.tesoro) && Number.isFinite(n.infamia));
});
