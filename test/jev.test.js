import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { advanceDay } from '../public/js/sim/loop.js';
import { declareWar } from '../public/js/sim/war.js';
import { createJevAi, createReplayAi } from '../public/js/ai/jev.js';
import { buildControllers } from '../public/js/ai/modes.js';
import { rulesController } from '../public/js/ai/rules.js';

const caratteri = { roma: 'Ambiziosa.', latini: 'Prudenti.', volsci: 'Predoni.', siculi: 'Isolani.' };

// Jev finto e deterministico: preferisce la prima opzione che non è quella prudente; accetta le paci.
async function stubAsk({ questions }) {
  const answers = {};
  for (const [k, q] of Object.entries(questions)) {
    if (q.type === 'noul') { answers[k] = { type: 'noul', noul: 0.8 }; continue; }
    const keys = Object.keys(q.criteria);
    const pick = keys.find(o => o !== 'nessuna guerra' && o !== 'difendi') ?? keys[0];
    answers[k] = { type: 'choice', choice: pick, probabilities: Object.fromEntries(keys.map(o => [o, o === pick ? 0.8 : 0.2 / (keys.length - 1)])), confidence: 0.7 };
  }
  return { answers, usage: { input_tokens: 100, output_tokens: 10 } };
}

async function play(game, controllers, ai, giorni) {
  for (let i = 0; i < giorni; i++) {
    advanceDay(game, controllers);
    if (ai) await ai.flush();
  }
}

test('Jev decide: guerre dichiarate da Jev, registro completo', async () => {
  const g = makeGame(5);
  g.balance = structuredClone(g.balance); g.balance.ia.anniDiRespiro = 0; // misura le domande di guerra, non il respiro iniziale
  const records = [];
  const ai = createJevAi({ ask: stubAsk, caratteri, onRecord: r => records.push(r) });
  await play(g, buildControllers(g, 'jev', ai), ai, 365 * 3);
  assert.ok(records.length > 0);
  assert.ok(records.some(r => r.domande.some(d => d.domanda === 'guerra' && d.fonte === 'jev' && d.scelta !== 'nessuna guerra')));
  assert.ok(records.every(r => Number.isInteger(r.giorno) && r.applicato >= r.giorno && Array.isArray(r.comandi)));
  assert.equal(ai.inAttesa(), 0);
});

test('rigioco dal registro: stesso stato finale', async () => {
  const a = makeGame(9);
  const records = [];
  const ai = createJevAi({ ask: stubAsk, caratteri, onRecord: r => records.push(r) });
  await play(a, buildControllers(a, 'jev', ai), ai, 365 * 4);
  const b = makeGame(9);
  const replay = createReplayAi(records);
  await play(b, buildControllers(b, 'jev', replay), null, 365 * 4);
  assert.deepEqual(b, a);
});

test('Jev in errore: decidono le regole e il gioco va avanti', async () => {
  const g = makeGame(5);
  const records = [];
  const ai = createJevAi({ ask: async () => { throw new Error('Jev 529: occupato'); }, caratteri, onRecord: r => records.push(r) });
  await play(g, buildControllers(g, 'jev', ai), ai, 365 * 2);
  assert.ok(records.length > 0);
  assert.ok(records.every(r => r.errore && r.domande.every(d => d.fonte === 'regola' || d.fonte === 'superata')));
  assert.equal(g.day, 730);
});

test('risposta oltre i 60 giorni: scartata, decide la regola', async () => {
  const g = makeGame(1);
  const records = [];
  let rilascia;
  const ai = createJevAi({ ask: () => new Promise(r => { rilascia = r; }), caratteri, onRecord: r => records.push(r) });
  // la richiesta parte in un microtask: si cede il turno dopo ogni giorno
  while (!rilascia) { advanceDay(g, { roma: ai.controller }); await new Promise(r => setImmediate(r)); }
  g.day += 61;
  rilascia(await stubAsk({ questions: { guerra: { type: 'choice', criteria: { 'nessuna guerra': null, volsci: null, latini: null } } } }));
  await ai.flush();
  ai.controller(g, 'roma');
  assert.equal(records.length, 1);
  assert.equal(records[0].domande[0].fonte, 'regola');
  assert.match(records[0].errore, /60 giorni/);
});

test('coda limitata: le richieste in eccesso ricadono sulle regole', async () => {
  const records = [];
  const ai = createJevAi({ ask: () => new Promise(() => {}), caratteri, maxParallel: 1, maxCoda: 2, onRecord: r => records.push(r) });
  const g = makeGame(1);
  for (let i = 0; i < 400; i++) advanceDay(g, buildControllers(g, 'jev', ai));
  assert.ok(ai.inAttesa() <= 3);
  assert.ok(records.some(r => r.errore === 'coda piena'));
});

test('modalità: regole, jev, misto', () => {
  const g = makeGame();
  const ai = { controller: () => [] };
  assert.equal(buildControllers(g, 'regole', null).roma, rulesController);
  assert.equal(buildControllers(g, 'jev', ai).latini, ai.controller);
  const m = buildControllers(g, 'misto', ai);
  assert.deepEqual(g.ordine.map(id => m[id] === ai.controller), [true, false, true, false]);
  assert.equal(buildControllers(g, 'jev', ai, 'roma').roma, undefined);
});

// Jev controllabile: le risposte partono quando il test lo decide.
function rinviato() {
  const rilasci = [];
  return { ask: () => new Promise(r => rilasci.push(r)), rilasci };
}
const risposta = (q, scelta, chiavi) => ({ answers: { [q]: { choice: scelta, probabilities: Object.fromEntries(chiavi.map(k => [k, k === scelta ? 0.8 : 0.2 / (chiavi.length - 1)])) } } });
const GUERRA = ['nessuna guerra', 'volsci', 'latini'];

test('due risposte di guerra lo stesso giorno: una sola dichiarazione', async () => {
  const g = makeGame(1);
  g.balance = structuredClone(g.balance); g.balance.ia.anniDiRespiro = 0; // misura le domande di guerra, non il respiro iniziale
  const records = [];
  const { ask, rilasci } = rinviato();
  const ai = createJevAi({ ask, caratteri, onRecord: r => records.push(r) });
  while (rilasci.length < 2) { advanceDay(g, { roma: ai.controller }); await new Promise(r => setImmediate(r)); }
  rilasci[0](risposta('guerra', 'volsci', GUERRA));
  rilasci[1](risposta('guerra', 'latini', GUERRA));
  await ai.flush();
  const cmds = ai.controller(g, 'roma');
  assert.equal(cmds.filter(c => c.tipo === 'dichiara_guerra').length, 1);
  assert.ok(records.some(r => r.domande.some(d => d.fonte === 'superata')));
});

test('guerra diventata illegale prima della risposta: niente dichiarazione', async () => {
  const g = makeGame(1);
  g.balance = structuredClone(g.balance); g.balance.ia.anniDiRespiro = 0; // misura le domande di guerra, non il respiro iniziale
  const records = [];
  const { ask, rilasci } = rinviato();
  const ai = createJevAi({ ask, caratteri, onRecord: r => records.push(r) });
  while (!rilasci.length) { advanceDay(g, { roma: ai.controller }); await new Promise(r => setImmediate(r)); }
  g.nazioni.roma.tregue.latini = g.day + 1000;
  rilasci[0](risposta('guerra', 'latini', GUERRA));
  await ai.flush();
  const cmds = ai.controller(g, 'roma');
  assert.equal(cmds.filter(c => c.tipo === 'dichiara_guerra').length, 0);
  assert.equal(records[0].domande[0].fonte, 'superata');
});

test('obiettivo senza risposta di Jev: azzerato, decidono le regole', async () => {
  const g = makeGame(1);
  declareWar(g, 'roma', 'volsci');
  g.nazioni.roma.obiettivo = 'f';
  const ai = createJevAi({ ask: async () => { throw new Error('Jev 529'); }, caratteri });
  for (let i = 0; i < 200; i++) { advanceDay(g, { roma: ai.controller }); await ai.flush(); }
  assert.equal(g.nazioni.roma.obiettivo, null);
});

test('Jev risponde anche alle proposte diplomatiche', async () => {
  const { propose } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame(1);
  const records = [];
  const ai = createJevAi({ ask: stubAsk, caratteri, onRecord: r => records.push(r) });
  propose(g, 'roma', 'alleanza', 'latini');
  advanceDay(g, { latini: ai.controller });
  await ai.flush();
  advanceDay(g, { latini: ai.controller });
  assert.ok(records.some(r => r.domande.some(d => d.domanda === 'alleanza' && d.fonte === 'jev' && d.scelta === 'accetta')));
  assert.deepEqual(g.nazioni.latini.alleati, ['roma']);
});

test('Jev sceglie la riforma: il comando segue la sua risposta, il registro la ricorda', async () => {
  const g = makeGame();
  const records = [];
  const ask = async ({ questions }) => ({
    answers: Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, k === 'riforma'
      ? { type: 'choice', choice: 'patrizi', probabilities: { patrizi: 1 }, confidence: 1 }
      : { type: 'choice', choice: Object.keys(q.criteria)[0], probabilities: { [Object.keys(q.criteria)[0]]: 1 }, confidence: 1 }])),
    usage: { input_tokens: 1, output_tokens: 1 }
  });
  const ai = createJevAi({ ask, caratteri, onRecord: r => records.push(r) });
  const controllers = { roma: ai.controller };
  await play(g, controllers, ai, 400);
  const r = records.find(x => x.domande.some(d => d.domanda === 'riforma'));
  assert.ok(r);
  assert.deepEqual(r.comandi.filter(c => c.tipo === 'slider'), [{ tipo: 'slider', nazione: 'roma', quale: 'societa', verso: -1 }]);
  assert.equal(g.nazioni.roma.slider.societa, -1);
});

test('Jev sceglie negli eventi: comando secondo la risposta, registro con la domanda', async () => {
  const cat = [{ id: 'e', titolo: 'E', testo: 'T.', condizioni: { probabilita: 1, popoli: ['roma'] },
    opzioni: [{ id: 'a', testo: 'A', effetti: [] }, { id: 'b', testo: 'B', effetti: [{ stabilita: 1 }] }], regola: 'a' }];
  const g = makeGame(1, cat);
  const records = [];
  const ask = async ({ questions }) => ({
    answers: Object.fromEntries(Object.entries(questions).map(([k, q]) => [k, k === 'evento'
      ? { type: 'choice', choice: 'b', probabilities: { b: 1 }, confidence: 1 }
      : { type: 'choice', choice: Object.keys(q.criteria)[0], probabilities: { [Object.keys(q.criteria)[0]]: 1 }, confidence: 1 }])),
    usage: { input_tokens: 1, output_tokens: 1 }
  });
  const ai = createJevAi({ ask, caratteri, onRecord: r => records.push(r) });
  await play(g, { roma: ai.controller }, ai, 40);
  const r = records.find(x => x.domande.some(d => d.domanda === 'evento'));
  assert.ok(r);
  assert.equal(r.comandi.find(c => c.tipo === 'scegli').opzione, 'b');
  assert.equal(g.nazioni.roma.stabilita, 1);
  assert.deepEqual(g.eventi, {});
});
