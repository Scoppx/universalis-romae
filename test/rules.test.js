import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { armiesOf, createArmy, RIBELLI } from '../public/js/sim/state.js';
import { ensureRebels } from '../public/js/sim/culture.js';
import { monthlyEvents } from '../public/js/sim/events.js';
import { declareWar, proposePeace } from '../public/js/sim/war.js';
import { advanceDay } from '../public/js/sim/loop.js';
import { applyCommand } from '../public/js/sim/commands.js';
import {
  isSliderDay, sliderDecision, colonyDecision, eventAnswers,
  peaceProposals, rulesController, warCandidates, strategy, answerProposals, armyOrders, recruitment, legalWarTargets, warDecision, routine, diplomacyInitiatives, ultimatumDecision
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
  g.balance = structuredClone(g.balance); g.balance.ia.anniDiRespiro = 0; // misura la scelta del bersaglio, non il respiro iniziale
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

test('eserciti: non restano fermi in una provincia nemica tenuta da un terzo', () => {
  const g = makeGame();
  declareWar(g, 'roma', 'volsci');
  declareWar(g, 'latini', 'volsci');
  g.province.c.controller = 'latini';
  const [r] = armiesOf(g, 'roma');
  r.prov = 'c';
  assert.deepEqual(armyOrders(g, 'roma'), [{ tipo: 'muovi', nazione: 'roma', esercito: r.id, verso: 'f' }]);
});

test('obiettivo: gli eserciti lo seguono se è valido', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  declareWar(g, 'roma', 'volsci');
  g.nazioni.roma.obiettivo = 'f';
  assert.deepEqual(armyOrders(g, 'roma'), [{ tipo: 'muovi', nazione: 'roma', esercito: r.id, verso: 'f' }]);
  g.nazioni.roma.obiettivo = 'd'; // dei latini, non in guerra: non valido
  assert.deepEqual(armyOrders(g, 'roma'), [{ tipo: 'muovi', nazione: 'roma', esercito: r.id, verso: 'c' }]);
  r.prov = 'b';
  g.nazioni.roma.obiettivo = 'a'; // presidio della capitale
  assert.deepEqual(armyOrders(g, 'roma'), [{ tipo: 'muovi', nazione: 'roma', esercito: r.id, verso: 'a' }]);
  r.prov = 'a';
  assert.deepEqual(armyOrders(g, 'roma'), []);
});

test('bersagli legali e decisione di guerra', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance); g.balance.ia.anniDiRespiro = 0; // misura la scelta del bersaglio, non il respiro iniziale
  assert.deepEqual(legalWarTargets(g, 'roma').map(c => c.id), ['volsci', 'latini']);
  g.nazioni.roma.stabilita = -1;
  assert.deepEqual(legalWarTargets(g, 'roma'), []);
  g.nazioni.latini.infamia = 25; // pretesto contro i latini
  assert.deepEqual(legalWarTargets(g, 'roma').map(c => c.id), ['latini']);
  assert.deepEqual(warDecision(g, 'roma'), [{ tipo: 'dichiara_guerra', nazione: 'roma', contro: 'latini' }]);
  g.nazioni.roma.infamia = 20;
  assert.deepEqual(legalWarTargets(g, 'roma'), []);
});

test('obiettivo: una provincia propria vale solo se è la capitale', () => {
  const g = makeGame();
  const [r] = armiesOf(g, 'roma');
  declareWar(g, 'roma', 'volsci');
  r.prov = 'a';
  g.nazioni.roma.obiettivo = 'b'; // propria e controllata, ma non capitale: già liberata, non è più un obiettivo
  assert.deepEqual(armyOrders(g, 'roma'), [{ tipo: 'muovi', nazione: 'roma', esercito: r.id, verso: 'c' }]);
});

test('obiettivo azzerato: dalle regole sempre, dalla routine in pace', () => {
  const g = makeGame();
  g.nazioni.roma.obiettivo = 'a';
  assert.ok(rulesController(g, 'roma').some(c => c.tipo === 'obiettivo' && c.provincia === null));
  assert.deepEqual(routine(g, 'roma').filter(c => c.tipo === 'obiettivo'), [{ tipo: 'obiettivo', nazione: 'roma', provincia: null }]);
  declareWar(g, 'roma', 'volsci');
  assert.deepEqual(routine(g, 'roma').filter(c => c.tipo === 'obiettivo'), []);
});

test('regole: rispondono a ogni tipo di proposta', async () => {
  const { propose } = await import('../public/js/sim/diplomacy.js');
  const { createArmy } = await import('../public/js/sim/state.js');
  const g = makeGame();
  const risposte = id => Object.fromEntries(answerProposals(g, id).map(c => [g.proposte[c.proposta].tipo, c.accetta]));
  propose(g, 'roma', 'alleanza', 'latini');       // relazione 30 ≥ 25: sì
  propose(g, 'siculi', 'alleanza', 'volsci');     // relazione 0: no
  assert.deepEqual(risposte('latini'), { alleanza: true });
  assert.deepEqual(risposte('volsci'), { alleanza: false });
  createArmy(g, 'roma', 'a', 20000, 0);
  propose(g, 'roma', 'tributo', 'volsci');        // roma molto più forte: paga
  propose(g, 'roma', 'ultimatum', 'volsci', { provincia: 'c' });
  assert.deepEqual(risposte('volsci'), { alleanza: false, tributo: true, ultimatum: true });
});

test('regole: ultimatum invece della guerra contro un vicino molto più debole, poi guerra col pretesto', async () => {
  const { createArmy } = await import('../public/js/sim/state.js');
  const g = makeGame();
  g.balance = structuredClone(g.balance); g.balance.ia.anniDiRespiro = 0; // misura la scelta del bersaglio, non il respiro iniziale
  createArmy(g, 'roma', 'a', 20000, 0);
  const [cmd] = ultimatumDecision(g, 'roma');
  assert.equal(cmd.tipo, 'proponi');
  assert.equal(cmd.genere, 'ultimatum');
  assert.ok(['c', 'd', 'e', 'f'].includes(cmd.provincia));
  g.nazioni.roma.pretesti[cmd.verso] = g.day + 100;
  assert.deepEqual(ultimatumDecision(g, 'roma'), []);
  assert.equal(strategy(g, 'roma')[0].tipo, 'dichiara_guerra');
});

test('regole: iniziative diplomatiche, una per volta', async () => {
  const { createArmy } = await import('../public/js/sim/state.js');
  const { changeRelation } = await import('../public/js/sim/diplomacy.js');
  const g = makeGame();
  createArmy(g, 'volsci', 'c', 20000, 0); // i volsci diventano una minaccia per roma
  assert.deepEqual(diplomacyInitiatives(g, 'roma'), [{ tipo: 'proponi', nazione: 'roma', genere: 'alleanza', verso: 'latini' }]);
  const h = makeGame();
  createArmy(h, 'roma', 'a', 20000, 0);
  changeRelation(h, 'roma', 'volsci', 60);
  assert.deepEqual(diplomacyInitiatives(h, 'roma'), [{ tipo: 'proponi', nazione: 'roma', genere: 'foedus', verso: 'volsci' }]);
});

test('un federato non sceglie guerre', () => {
  const g = makeGame();
  g.nazioni.volsci.protettore = 'roma';
  assert.deepEqual(legalWarTargets(g, 'volsci'), []);
});

test('un federato diventato più forte del protettore esce dal foedus', async () => {
  const { createArmy } = await import('../public/js/sim/state.js');
  const g = makeGame();
  g.nazioni.volsci.protettore = 'roma';
  assert.deepEqual(diplomacyInitiatives(g, 'volsci'), []);
  createArmy(g, 'volsci', 'c', 20000, 0);
  assert.deepEqual(diplomacyInitiatives(g, 'volsci'), [{ tipo: 'esci_foedus', nazione: 'volsci' }]);
});

test('slider a regole: prima il malcontento, poi la guerra secondo i vicini, poi la società', () => {
  const g = makeGame();
  assert.deepEqual(sliderDecision(g, 'roma'), [{ tipo: 'slider', nazione: 'roma', quale: 'guerra', verso: 1 }]);
  g.province.b.cultura = 'volsca';
  g.nazioni.roma.stabilita = -1;
  assert.deepEqual(sliderDecision(g, 'roma'), [{ tipo: 'slider', nazione: 'roma', quale: 'governo', verso: 1 }]);
  g.nazioni.roma.ultimoSlider = 0;
  assert.deepEqual(sliderDecision(g, 'roma'), []);
});

test('slider a regole: un giorno l\'anno per popolo', () => {
  const g = makeGame();
  const giorni = [];
  for (let d = 0; d < 365; d++) { g.day = d; if (isSliderDay(g, 'roma')) giorni.push(d); }
  assert.equal(giorni.length, 1);
});

test('colonie a regole: nella provincia straniera più ricca, in pace e con riserve', () => {
  const g = makeGame();
  g.province.b.cultura = 'volsca';
  g.province.a.cultura = 'volsca';
  g.nazioni.roma.cultura = 'latina';
  g.nazioni.roma.tesoro = 100;
  g.nazioni.roma.uomini = 3000;
  assert.deepEqual(colonyDecision(g, 'roma'), [{ tipo: 'colonia', nazione: 'roma', provincia: 'a' }]);
  g.nazioni.roma.uomini = 1500;
  assert.deepEqual(colonyDecision(g, 'roma'), []);
});

test('in guerra con un obiettivo, l\'esercito più vicino va comunque a reprimere la rivolta', () => {
  const g = makeGame();
  declareWar(g, 'roma', 'volsci');
  ensureRebels(g);
  createArmy(g, RIBELLI, 'b', 500, 0);
  createArmy(g, 'roma', 'a', 3000, 0);
  g.nazioni.roma.obiettivo = 'c';
  const verso = armyOrders(g, 'roma').filter(c => c.tipo === 'muovi').map(c => c.verso).sort();
  assert.deepEqual(verso, ['b', 'c']);
});

test('regole sugli eventi: scelgono l\'opzione indicata dall\'evento', () => {
  const g = makeGame(1, [{ id: 'e', titolo: 'E', testo: 'T.', condizioni: { probabilita: 1, popoli: ['roma'] },
    opzioni: [{ id: 'a', testo: 'A', effetti: [] }, { id: 'b', testo: 'B', effetti: [{ stabilita: 1 }] }], regola: 'b' }]);
  monthlyEvents(g);
  const pid = Object.keys(g.eventi)[0];
  assert.deepEqual(eventAnswers(g, 'roma'), [{ tipo: 'scegli', nazione: 'roma', evento: pid, opzione: 'b' }]);
  assert.deepEqual(eventAnswers(g, 'latini'), []);
  assert.ok(rulesController(g, 'roma').some(c => c.tipo === 'scegli'));
});

test('respiro iniziale: niente bersagli per le regole né per Jev nei primi anni', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.ia.anniDiRespiro = 5;
  assert.deepEqual(legalWarTargets(g, 'roma'), []);
  assert.deepEqual(warDecision(g, 'roma'), []);
  assert.equal(applyCommand(g, { tipo: 'dichiara_guerra', nazione: 'roma', contro: 'volsci' }).ok, true); // il giocatore può
  g.day = 5 * 365;
  assert.ok(legalWarTargets(g, 'latini').length > 0);
});

test('stanchezza: dopo anni di guerra le regole propongono e accettano la pace bianca', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.ia.stanchezzaAnni = 8;
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.guerre[guerra].battaglie = 20; // roma vince di 20
  g.day = 8 * 365;
  assert.ok(peaceProposals(g, 'volsci').some(c => c.termini.province.length === 0));
  proposePeace(g, 'volsci', guerra, { ricevente: 'volsci', province: [] });
  assert.equal(answerProposals(g, 'roma').find(c => c.tipo === 'rispondi').accetta, true);
  g.day = 7 * 365;
  assert.equal(answerProposals(g, 'roma').find(c => c.tipo === 'rispondi').accetta, false);
});

// Quante province di un popolo può prendere una sola pace: almeno una, al più la quota delle sue province.
export function maxCedibili(game, owner) {
  return Math.max(1, Math.floor(provincesOf(game, owner).length * (game.balance.guerra.quotaPace ?? 1)));
}
