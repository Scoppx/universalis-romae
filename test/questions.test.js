import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { declareWar, proposePeace } from '../public/js/sim/war.js';
import { buildReview, buildPeaceQuestion, interpretChoice, buildProposalQuestion, buildSliderQuestion, sampleChoice, buildEventQuestion } from '../public/js/ai/questions.js';
import { monthlyEvents } from '../public/js/sim/events.js';

test('in pace: domanda di guerra con i soli bersagli legali e la scelta di restare in pace', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance); g.balance.ia.anniDiRespiro = 0; // misura le domande di guerra, non il respiro iniziale
  g.balance.ia.rapportoGuerra = 1.5; // anche i bersagli sotto la soglia di forza attuale
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

test('domanda sulla riforma: solo le mosse legali, più "nessuna"', () => {
  const g = makeGame();
  g.nazioni.roma.slider.guerra = 5;
  const q = buildSliderQuestion(g, 'roma', 'Ambiziosa.');
  const opzioni = Object.keys(q.questions.riforma.criteria);
  assert.deepEqual(opzioni, ['nessuna', 'patrizi', 'plebe', 'difesa', 'accentramento', 'autonomia']);
  assert.deepEqual(q.meta.riforma.mappa.difesa, { quale: 'guerra', verso: -1 });
  assert.equal(q.meta.riforma.mappa.nessuna, null);
  assert.equal(q.state.riforme.guerra, 5);
  g.nazioni.roma.ultimoSlider = 0;
  assert.equal(buildSliderQuestion(g, 'roma', ''), null);
});

test('estrazione a temperatura: deterministica per chiave, segue le probabilità', () => {
  const meta = { mappa: { a: 1, b: 2, c: 3 } };
  const ans = { probabilities: { a: 0.75, b: 0.25, c: 0, z: 0.5 } };
  assert.deepEqual(sampleChoice(ans, meta, 42), sampleChoice(ans, meta, 42));
  let quanteA = 0;
  for (let k = 0; k < 1000; k++) {
    const v = sampleChoice(ans, meta, k);
    assert.ok(v.scelta === 'a' || v.scelta === 'b'); // c ha probabilità 0, z non è un'opzione
    if (v.scelta === 'a') quanteA++;
  }
  assert.ok(quanteA > 720 && quanteA < 880, String(quanteA)); // 0,75^1,25 / (0,75^1,25 + 0,25^1,25) ≈ 0,80
  assert.equal(sampleChoice({}, meta, 1), null);
});

test('domanda su un evento: opzioni con il riassunto degli effetti, l\'altro per nome', () => {
  const g = makeGame(1, [{ id: 'e', titolo: 'Contesa', testo: 'Un confine conteso.', condizioni: { probabilita: 1, popoli: ['roma'], altro: { preferiti: ['volsci'] } },
    opzioni: [{ id: 'rivendicare', testo: 'Rivendicare', effetti: [{ pretesto: true }] }, { id: 'trattare', testo: 'Trattare', effetti: [{ relazione: 20 }] }], regola: 'trattare' }]);
  monthlyEvents(g);
  const pid = Object.keys(g.eventi)[0];
  const q = buildEventQuestion(g, pid, 'Ambiziosa.');
  assert.equal(q.state.evento.titolo, 'Contesa');
  assert.equal(q.state.evento.altro, 'volsci');
  assert.deepEqual(q.questions.evento.criteria, {
    rivendicare: 'Rivendicare (pretesto contro volsci)',
    trattare: 'Trattare (relazioni con volsci +20)'
  });
  assert.deepEqual(q.meta.evento, { tipo: 'evento', evento: pid, mappa: { rivendicare: 'rivendicare', trattare: 'trattare' }, prudente: 'trattare' });
});

test('domanda di guerra: guadagno e rischio per ogni bersaglio, la pace non è la scelta saggia per definizione', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.ia.anniDiRespiro = 0;
  g.balance.ia.rapportoGuerra = 1.5;
  const q = buildReview(g, 'roma', 'Ambiziosa.');
  const c = q.questions.guerra.criteria;
  assert.equal(c['nessuna guerra'], 'Lasciar passare l\'occasione: nessun rischio, ma i vicini intanto si rafforzano e l\'occasione può non tornare.');
  assert.match(c.volsci, /conquistare/);
  assert.match(c.volsci, /2 province, tasse 2/);
  assert.match(c.volsci, /rischio/);
  assert.deepEqual(q.state.vicini_attaccabili.find(v => v.nome === 'volsci').province, 2);
});

test('domanda di guerra solo davanti a un\'occasione: bersagli con il vantaggio di forze delle regole', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.ia.anniDiRespiro = 0;
  g.balance.ia.rapportoGuerra = 2;
  const q = buildReview(g, 'roma', 'Ambiziosa.');
  assert.deepEqual(Object.keys(q.questions.guerra.criteria), ['nessuna guerra', 'volsci']); // i latini (1,95) non bastano
  assert.equal(q.questions.guerra.criteria['nessuna guerra'], 'Lasciar passare l\'occasione: nessun rischio, ma i vicini intanto si rafforzano e l\'occasione può non tornare.');
  assert.match(q.questions.guerra.criteria.volsci, /^Cogliere l'occasione: dichiarare guerra a volsci/);
  g.balance.ia.rapportoGuerra = 5;
  assert.equal(buildReview(g, 'roma', 'Ambiziosa.'), null); // nessuna occasione: nessuna domanda
});
