import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { loadData } from '../tools/load-data.js';
import { declareWar, proposePeace, makePeace } from '../public/js/sim/war.js';
import { createArmy } from '../public/js/sim/state.js';
import * as V from '../public/js/ui/views.js';
import { provinceFill, cultureColor, RELAZIONE, TERRENO } from '../public/js/ui/colors.js';

test('barra in alto', () => {
  const g = makeGame();
  assert.deepEqual(V.topBar(g, 'roma'), {
    data: '21 aprile 753 a.C. (AUC 1)', tesoro: '3.6', entrate: '+0.04/mese',
    uomini: '1950/3900', stabilita: '0', infamia: '0.0/20'
  });
  g.nazioni.roma.stabilita = 2;
  assert.equal(V.topBar(g, 'roma').stabilita, '+2');
});

test('schede dei popoli: 38, prima i facili, tratti leggibili', () => {
  const cards = V.peopleCards(loadData().popoli);
  assert.equal(cards.length, 38);
  assert.equal(cards[0].id, 'roma');
  assert.equal(cards[0].tratti, 'reclute +50%, stabilità +50%, battaglia +1');
  assert.equal(cards.at(-1).difficolta, 'molto difficile');
  assert.equal(V.formatTratti({ assedio: -0.5, montagna: 2 }), 'assedio -50%, montagna +2');
});

test('provincia: occupazione, eserciti, reclutamento', () => {
  const g = makeGame();
  declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  const v = V.provinceInfo(g, 'c', 'roma');
  assert.deepEqual(v.proprietario, { id: 'volsci', nome: 'volsci' });
  assert.deepEqual(v.occupante, { id: 'roma', nome: 'roma' });
  assert.equal(v.puoReclutare, false);
  const a = V.provinceInfo(g, 'a', 'roma');
  assert.equal(a.occupante, null);
  assert.equal(a.puoReclutare, true);
  assert.deepEqual(a.eserciti.map(e => [e.nazione, e.mio, e.uomini]), [['roma', true, 2574]]);
});

test('governo', () => {
  const g = makeGame();
  assert.deepEqual(V.governmentView(g, 'roma'), {
    nome: 'roma', governo: 'tribù', stabilita: '0', tratti: 'reclute +30%', costoStabilita: '22.0', puoAlzare: false
  });
});

test('diplomazia: vicini, stato, tregua', () => {
  const g = makeGame();
  assert.deepEqual(V.diplomacyView(g, 'roma').map(d => [d.id, d.stato, d.puoDichiarare, d.costo]),
    [['latini', 'pace', true, 2], ['volsci', 'pace', true, 2]]);
  const { guerra } = declareWar(g, 'roma', 'volsci');
  assert.equal(V.diplomacyView(g, 'roma')[1].stato, 'guerra');
  makePeace(g, guerra, 'roma', { province: [] });
  const d = V.diplomacyView(g, 'roma')[1];
  assert.equal(d.stato, 'tregua');
  assert.equal(d.finoA, '21 aprile 748 a.C. (AUC 6)');
  assert.equal(d.puoDichiarare, false);
});

test('guerre: punteggio, province da chiedere e da cedere', () => {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  const [w] = V.warsView(g, 'roma');
  assert.deepEqual([w.id, w.nemico.id, w.ruolo, w.punteggio], [guerra, 'volsci', 'attaccante', 50]);
  assert.deepEqual(w.daChiedere, [{ id: 'c', nome: 'C', costo: 50 }]);
  assert.deepEqual(V.warsView(g, 'volsci')[0].daCedere, [{ id: 'c', nome: 'C', costo: 50 }]);
  proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'] });
  assert.equal(V.warsView(g, 'roma')[0].propostaInAttesa, true);
  assert.deepEqual(V.pendingProposals(g, 'volsci').map(p => p.testo), ['roma chiede la pace e vuole: C.']);
});

test('eserciti del giocatore', () => {
  const g = makeGame();
  createArmy(g, 'roma', 'b', 500, 50);
  g.eserciti.e5.percorso = ['a'];
  assert.deepEqual(V.armiesView(g, 'roma').map(a => [a.provincia, a.fanteria, a.destinazione]),
    [['A', 2340, null], ['B', 500, 'A']]);
});

test('notizie: guerre e paci per tutti, battaglie solo se ti riguardano', () => {
  const g = makeGame();
  assert.equal(V.formatLogEntry({ tipo: 'guerra', attaccante: 'roma', difensore: 'volsci' }, g, 'siculi'), 'roma dichiara guerra a volsci.');
  assert.equal(V.formatLogEntry({ tipo: 'battaglia', prov: 'c', vincitore: 'roma', sconfitto: 'volsci' }, g, 'siculi'), null);
  assert.equal(V.formatLogEntry({ tipo: 'battaglia', prov: 'c', vincitore: 'roma', sconfitto: 'volsci' }, g, 'volsci'), 'Battaglia a C: vince roma.');
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  makePeace(g, guerra, 'roma', { province: ['c'] });
  const pace = g.log.find(e => e.tipo === 'pace');
  assert.deepEqual(pace.parti, ['roma', 'volsci']);
  assert.equal(V.formatLogEntry(pace, g, 'siculi'), 'Pace tra roma e volsci: roma ottiene C.');
  assert.equal(V.formatLogEntry({ tipo: 'proposta' }, g, 'roma'), null);
});

test('classifica', () => {
  const g = makeGame();
  assert.deepEqual(V.rankingView(g, 'latini').slice(0, 2), [
    { pos: 1, nome: 'roma', punteggio: 8, vivo: true, tu: false },
    { pos: 2, nome: 'latini', punteggio: 7, vivo: true, tu: true }
  ]);
});

test('colori per modalità', () => {
  const g = makeGame();
  const c = g.province.c;
  assert.equal(provinceFill(g, c, 'politica', 'roma'), '#888888');
  assert.equal(provinceFill(g, c, 'terreno', 'roma'), TERRENO.montagna);
  assert.equal(provinceFill(g, c, 'cultura', 'roma'), cultureColor('volsca'));
  assert.notEqual(cultureColor('latina'), cultureColor('volsca'));
  assert.equal(provinceFill(g, g.province.a, 'relazioni', 'roma'), RELAZIONE.tu);
  assert.equal(provinceFill(g, c, 'relazioni', 'roma'), RELAZIONE.neutrale);
  declareWar(g, 'roma', 'volsci');
  assert.equal(provinceFill(g, c, 'relazioni', 'roma'), RELAZIONE.guerra);
  assert.equal(provinceFill(g, c, 'relazioni', null), RELAZIONE.neutrale);
});
