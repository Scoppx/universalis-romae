import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { dormantReady, activateDormant } from '../public/js/sim/dormant.js';
import { conditionsHold, eventDef, monthlyEvents, chooseOption, describeEffects } from '../public/js/sim/events.js';
import { atWar } from '../public/js/sim/war.js';
import { relation } from '../public/js/sim/diplomacy.js';
import { armiesOf } from '../public/js/sim/state.js';

const coloni = {
  id: 'coloni_taranto', titolo: 'Coloni', testo: 'Sbarcano.', condizioni: { probabilita: 1, unaVolta: 'partita' },
  opzioni: [
    { id: 'accogliere', testo: 'Accoglierli', effetti: [{ crea_popolo: { popolo: 'taranto', esercito: 1, relazione: 50 } }, { tesoroMesi: 3 }] },
    { id: 'respingere', testo: 'Respingerli', effetti: [{ crea_popolo: { popolo: 'taranto', esercito: 2, guerra: true } }] }
  ],
  regola: 'accogliere', storico: true
};

test('i dormienti stanno nello stato, fuori dai popoli attivi', () => {
  const g = makeGame();
  assert.deepEqual(Object.keys(g.dormienti), ['taranto']);
  assert.equal(g.dormienti.taranto.capitale, 'g');
  assert.equal(g.nazioni.taranto, undefined);
});

test('pronto solo se la capitale è del popolo che riceve l\'evento e non è la sua ultima provincia', () => {
  const g = makeGame();
  assert.equal(dormantReady(g, 'taranto', 'siculi'), false); // g è l'unica provincia dei siculi
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  assert.equal(dormantReady(g, 'taranto', 'siculi'), true);
  assert.equal(dormantReady(g, 'taranto', 'volsci'), false);
  g.province.g.controller = 'volsci';
  assert.equal(dormantReady(g, 'taranto', 'siculi'), false);
});

test('risveglio accolto: prende la provincia, ha un esercito, relazioni buone, nessuna guerra', () => {
  const g = makeGame();
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  assert.equal(activateDormant(g, 'taranto', { esercito: 1, relazione: 50 }), 'taranto');
  const n = g.nazioni.taranto;
  assert.equal(n.vivo, true);
  assert.equal(n.cultura, 'greca');
  assert.ok(g.ordine.includes('taranto'));
  assert.equal(g.dormienti.taranto, undefined);
  assert.equal(g.province.g.owner, 'taranto');
  assert.equal(g.province.g.assimilazioneDi, 'taranto');
  assert.equal(armiesOf(g, 'taranto').length, 1);
  assert.equal(armiesOf(g, 'taranto')[0].fanteria, 2 * 300);
  assert.equal(relation(g, 'taranto', 'siculi'), 50);
  assert.equal(atWar(g, 'taranto', 'siculi'), false);
  assert.equal(g.nazioni.siculi.capitale, 'f'); // la capitale persa passa alla provincia rimasta
  assert.deepEqual(n.slider, { societa: 0, guerra: 0, governo: 0 });
  assert.ok(g.log.some(e => e.tipo === 'nascita' && e.nazione === 'taranto' && e.prov === 'g' && e.da === 'siculi'));
});

test('risveglio respinto: esercito più grande e guerra senza perdita di stabilità', () => {
  const g = makeGame();
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  activateDormant(g, 'taranto', { esercito: 2, guerra: true });
  assert.equal(armiesOf(g, 'taranto')[0].fanteria, 2 * 300 * 2);
  assert.equal(atWar(g, 'taranto', 'siculi'), true);
  assert.equal(g.nazioni.taranto.stabilita, 0);
  assert.equal(activateDormant(g, 'taranto', {}), null); // già sveglio
});

test('evento di risveglio: scatta solo per il padrone della capitale e porta il popolo', () => {
  const g = makeGame(1, [coloni]);
  assert.equal(conditionsHold(g, eventDef(g, 'coloni_taranto'), 'siculi'), false);
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  assert.equal(conditionsHold(g, eventDef(g, 'coloni_taranto'), 'siculi'), true);
  assert.equal(conditionsHold(g, eventDef(g, 'coloni_taranto'), 'roma'), false);
  monthlyEvents(g);
  const e = Object.values(g.eventi).find(x => x.nazione === 'siculi');
  assert.equal(describeEffects(g, e, coloni.opzioni[1]), 'nasce taranto (esercito ×2), in guerra con noi'); // nella fixture il nome è l'id
  assert.deepEqual(chooseOption(g, 'siculi', e.id, 'respingere'), { ok: true });
  assert.equal(atWar(g, 'taranto', 'siculi'), true);
});

test('se la capitale ha cambiato padrone dopo lo scatto, il risveglio si salta senza eliminare nessuno', () => {
  const g = makeGame(1, [coloni]);
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  monthlyEvents(g);
  const e = Object.values(g.eventi).find(x => x.nazione === 'siculi');
  g.province.f.owner = 'volsci'; g.province.f.controller = 'volsci'; // ai siculi resta solo g
  chooseOption(g, 'siculi', e.id, 'accogliere');
  assert.equal(g.nazioni.siculi.vivo, true);
  assert.equal(g.province.g.owner, 'siculi');
  assert.ok(g.dormienti.taranto);
});

test('un risveglio saltato non consuma l\'evento: potrà arrivare di nuovo', () => {
  const g = makeGame(1, [coloni]);
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  monthlyEvents(g);
  const e = Object.values(g.eventi).find(x => x.nazione === 'siculi');
  g.province.f.owner = 'volsci'; g.province.f.controller = 'volsci';
  chooseOption(g, 'siculi', e.id, 'accogliere');
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  assert.equal(conditionsHold(g, eventDef(g, 'coloni_taranto'), 'siculi'), true);
});

test('un dormiente accolto ha tregua con i confinanti; uno respinto resta in guerra con il vecchio padrone', () => {
  const g = makeGame();
  g.province.f.owner = 'siculi'; g.province.f.controller = 'siculi';
  activateDormant(g, 'taranto', { esercito: 2, guerra: true });
  assert.equal(atWar(g, 'taranto', 'siculi'), true);
  assert.equal(g.nazioni.taranto.tregue.siculi ?? -1, -1); // nessuna tregua con chi lo combatte
  const h = makeGame();
  h.province.f.owner = 'siculi'; h.province.f.controller = 'siculi';
  activateDormant(h, 'taranto', { esercito: 1 });
  assert.ok(h.nazioni.taranto.tregue.siculi > h.day);
});
