import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { declareWar, proposePeace } from '../public/js/sim/war.js';
import { buildReview, buildPeaceQuestion, interpretChoice, buildProposalQuestion } from '../public/js/ai/questions.js';

test('in pace: domanda di guerra con i soli bersagli legali e la scelta di restare in pace', () => {
  const g = makeGame();
  const q = buildReview(g, 'roma', 'Ambiziosa.');
  assert.deepEqual(Object.keys(q.questions), ['guerra']);
  assert.equal(q.questions.guerra.type, 'choice');
  assert.deepEqual(Object.keys(q.questions.guerra.criteria), ['nessuna guerra', 'volsci', 'latini']);
  assert.deepEqual(q.meta.guerra, { tipo: 'guerra', mappa: { 'nessuna guerra': null, volsci: 'volsci', latini: 'latini' }, prudente: 'nessuna guerra' });
  assert.equal(q.state.popolo.carattere, 'Ambiziosa.');
  assert.deepEqual(q.state.vicini_attaccabili.map(v => v.nome), ['volsci', 'latini']);
  g.nazioni.roma.infamia = 25;
  assert.equal(buildReview(g, 'roma', ''), null); // niente da decidere: nessuna richiesta
});

test('in guerra: obiettivi con significato diverso', () => {
  const g = makeGame();
  declareWar(g, 'roma', 'volsci');
  let q = buildReview(g, 'roma', '');
  assert.deepEqual(Object.keys(q.questions), ['obiettivo']);
  assert.deepEqual(q.meta.obiettivo.mappa, { difendi: 'a', vicina: 'c' }); // c è anche la più ricca e la capitale
  assert.equal(q.meta.obiettivo.prudente, 'difendi');
  g.province.b.controller = 'volsci';
  q = buildReview(g, 'roma', '');
  assert.equal(q.meta.obiettivo.mappa.libera, 'b');
  assert.equal(q.state.guerre[0].contro, 'volsci');
});

test('proposta di pace: domanda sì/no con i termini nello stato', () => {
  const g = makeGame();
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma';
  const { proposta } = proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'] });
  const q = buildPeaceQuestion(g, proposta, 'Montanari.');
  // una scelta tra due opzioni con significato chiaro: il sì/no restava sempre tra 0,1 e 0,3
  assert.equal(q.questions.pace.type, 'choice');
  assert.deepEqual(Object.keys(q.questions.pace.criteria), ['accetta', 'rifiuta']);
  assert.equal(q.state.popolo.nome, 'volsci');
  assert.equal(q.state.proposta.tipo, 'ci chiede province');
  assert.equal(q.state.guerra.situazione, 'la stiamo perdendo');
  assert.deepEqual(q.state.proposta.province.map(p => p.nome), ['C']);
  assert.deepEqual(q.meta, { pace: { tipo: 'pace', proposta, mappa: { accetta: true, rifiuta: false }, prudente: 'rifiuta' } });
});

test('interpretazione: più probabile, prudenza se incerto, null se inutilizzabile', () => {
  const meta = { mappa: { 'nessuna guerra': null, veio: 'veio', sabini: 'sabini' }, prudente: 'nessuna guerra' };
  const netta = interpretChoice({ choice: 'veio', probabilities: { 'nessuna guerra': 0.2, veio: 0.7, sabini: 0.1 } }, meta);
  assert.deepEqual([netta.scelta, netta.valore, netta.incerto], ['veio', 'veio', false]);
  const incerta = interpretChoice({ choice: 'veio', probabilities: { 'nessuna guerra': 0.35, veio: 0.45, sabini: 0.2 } }, meta);
  assert.deepEqual([incerta.scelta, incerta.valore, incerta.incerto], ['nessuna guerra', null, true]);
  const bassaMaStaccata = interpretChoice({ choice: 'veio', probabilities: { 'nessuna guerra': 0.25, veio: 0.45, sabini: 0.3 } }, meta);
  assert.equal(bassaMaStaccata.scelta, 'veio');
  assert.equal(interpretChoice({ choice: 'atlantide', probabilities: { atlantide: 1 } }, meta), null);
  assert.equal(interpretChoice(undefined, meta), null);
});

test('proposte non di pace: scelta accetta/rifiuta con i fatti nello stato', async () => {
  const { propose } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame();
  const { proposta } = propose(g, 'roma', 'alleanza', 'latini');
  const q = buildProposalQuestion(g, proposta, 'Prudenti.');
  assert.equal(q.questions.alleanza.type, 'choice');
  assert.deepEqual(Object.keys(q.questions.alleanza.criteria), ['accetta', 'rifiuta']);
  assert.equal(q.state.proposta.da, 'roma');
  assert.equal(q.state.proposta.relazione, 30);
  assert.deepEqual(q.meta.alleanza, { tipo: 'proposta', genere: 'alleanza', proposta, mappa: { accetta: true, rifiuta: false }, prudente: 'rifiuta' });
});
