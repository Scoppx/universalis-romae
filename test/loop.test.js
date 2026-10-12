import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf } from '../public/js/sim/state.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { advanceDay, isOver } from '../public/js/sim/loop.js';
import { score, ranking } from '../public/js/sim/score.js';
import { END_DAY } from '../public/js/sim/calendar.js';

test('comandi: smistamento e rifiuti', () => {
  const g = makeGame();
  assert.equal(applyCommand(g, { tipo: 'boh', nazione: 'roma' }).motivo, 'comando sconosciuto: boh');
  assert.equal(applyCommand(g, { tipo: 'dichiara_guerra', nazione: 'roma', contro: 'volsci' }).ok, true);
  const [v] = armiesOf(g, 'volsci');
  assert.equal(applyCommand(g, { tipo: 'muovi', nazione: 'roma', esercito: v.id, verso: 'f' }).motivo, 'esercito non tuo');
  const [r] = armiesOf(g, 'roma');
  assert.equal(applyCommand(g, { tipo: 'muovi', nazione: 'roma', esercito: r.id, verso: 'c' }).ok, true);
});

test('il giorno avanza, l\'economia gira il primo del mese', () => {
  const g = makeGame();
  for (let i = 0; i < 9; i++) advanceDay(g);
  const t9 = g.nazioni.roma.tesoro;
  advanceDay(g); // arriva al 1 maggio
  assert.equal(g.day, 10);
  assert.notEqual(g.nazioni.roma.tesoro, t9);
  const t10 = g.nazioni.roma.tesoro;
  advanceDay(g);
  assert.equal(g.nazioni.roma.tesoro, t10);
});

test('i controller vengono chiamati e i loro comandi applicati', () => {
  const g = makeGame();
  let calls = 0;
  const controllers = {
    roma: (game, id) => { calls++; return game.day === 0 ? [{ tipo: 'dichiara_guerra', nazione: id, contro: 'volsci' }] : []; }
  };
  const log = advanceDay(g, controllers);
  assert.equal(calls, 1);
  assert.ok(log.some(e => e.tipo === 'guerra'));
});

test('fine partita', () => {
  const g = makeGame();
  assert.equal(isOver(g), false);
  g.day = END_DAY;
  assert.equal(isOver(g), true);
});

test('punteggio e classifica', () => {
  const g = makeGame();
  assert.equal(score(g, 'roma'), 6 + 2);
  g.province.c.owner = 'roma';
  assert.equal(score(g, 'roma'), 6 + 2 + 1);
  assert.deepEqual(ranking(g).map(r => r.id), ['roma', 'latini', 'siculi', 'volsci']);
});

test('un controller non può dare ordini per un\'altra nazione', () => {
  const g = makeGame();
  const t = g.nazioni.latini.tesoro;
  advanceDay(g, { roma: () => [{ tipo: 'recluta', nazione: 'latini', provincia: 'd', fanteria: 100, cavalleria: 0 }] });
  assert.equal(g.nazioni.latini.tesoro, t);
  assert.equal(armiesOf(g, 'latini')[0].fanteria, 1200);
});

test('comando obiettivo', () => {
  const g = makeGame();
  assert.equal(g.nazioni.roma.obiettivo, null);
  assert.equal(applyCommand(g, { tipo: 'obiettivo', nazione: 'roma', provincia: 'c' }).ok, true);
  assert.equal(g.nazioni.roma.obiettivo, 'c');
  assert.equal(applyCommand(g, { tipo: 'obiettivo', nazione: 'roma', provincia: 'zz' }).motivo, 'provincia inesistente');
  assert.equal(applyCommand(g, { tipo: 'obiettivo', nazione: 'roma', provincia: null }).ok, true);
  assert.equal(g.nazioni.roma.obiettivo, null);
});
