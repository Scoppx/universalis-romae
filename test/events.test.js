import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { conditionsHold, resolveOther, monthlyEvents, chooseOption, expireEvents, describeEffects, eventDef } from '../public/js/sim/events.js';
import { monthlyIncome } from '../public/js/sim/economy.js';
import { maxManpower } from '../public/js/sim/state.js';
import { atWar, declareWar, hasPretext } from '../public/js/sim/war.js';
import { relation } from '../public/js/sim/diplomacy.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { advanceDay } from '../public/js/sim/loop.js';

const ev = (id, condizioni, opzioni, extra = {}) => ({ id, titolo: id.toUpperCase(), testo: `Testo di ${id}.`, condizioni, opzioni, regola: opzioni[0].id, ...extra });
const opt = (id, effetti) => ({ id, testo: `Opzione ${id}`, effetti });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('condizioni: anni, popoli, culture, governi, provincia, stabilità, guerra, numero di province', () => {
  const g = makeGame();
  const D = c => ev('x', { probabilita: 1, ...c }, [opt('a', [])]);
  assert.equal(conditionsHold(g, D({}), 'roma'), true);
  assert.equal(conditionsHold(g, D({ anni: [753, 700] }), 'roma'), true);
  assert.equal(conditionsHold(g, D({ anni: [600, 500] }), 'roma'), false);
  assert.equal(conditionsHold(g, D({ popoli: ['latini'] }), 'roma'), false);
  assert.equal(conditionsHold(g, D({ culture: ['latina'] }), 'roma'), true);
  assert.equal(conditionsHold(g, D({ governi: ['monarchia'] }), 'roma'), false);
  assert.equal(conditionsHold(g, D({ provincia: 'b' }), 'roma'), true);
  assert.equal(conditionsHold(g, D({ provincia: 'c' }), 'roma'), false);
  assert.equal(conditionsHold(g, D({ minProvince: 3 }), 'roma'), false);
  assert.equal(conditionsHold(g, D({ maxProvince: 2 }), 'roma'), true);
  assert.equal(conditionsHold(g, D({ stabilitaMax: -1 }), 'roma'), false);
  assert.equal(conditionsHold(g, D({ guerra: true }), 'roma'), false);
  declareWar(g, 'roma', 'volsci');
  assert.equal(conditionsHold(g, D({ guerra: true }), 'roma'), true);
  assert.equal(conditionsHold(g, D({ stabilitaMax: -1 }), 'roma'), true); // senza pretesto: −2
});

test('l\'altro: un confinante vivo, prima i preferiti; solo i preferiti se richiesto', () => {
  const g = makeGame();
  assert.equal(resolveOther(g, ev('x', { probabilita: 1, altro: {} }, [opt('a', [])]), 'roma'), 'latini');
  assert.equal(resolveOther(g, ev('x', { probabilita: 1, altro: { preferiti: ['siculi', 'volsci'] } }, [opt('a', [])]), 'roma'), 'volsci');
  assert.equal(resolveOther(g, ev('x', { probabilita: 1, altro: { culture: ['volsca'] } }, [opt('a', [])]), 'roma'), 'volsci');
  const solo = ev('x', { probabilita: 1, altro: { preferiti: ['siculi'], soloPreferiti: true } }, [opt('a', [])]);
  assert.equal(resolveOther(g, solo, 'roma'), null);
  assert.equal(conditionsHold(g, solo, 'roma'), false);
});

test('una volta per popolo, una volta per partita, ripetibile', () => {
  const g = makeGame(1, [
    ev('a_popolo', { probabilita: 1 }, [opt('a', [])]),
    ev('b_partita', { probabilita: 1, unaVolta: 'partita' }, [opt('a', [])]),
    ev('c_sempre', { probabilita: 1, unaVolta: false }, [opt('a', [])])
  ]);
  g.eventiFatti = { a_popolo: ['roma'], b_partita: ['latini'] };
  assert.equal(conditionsHold(g, eventDef(g, 'a_popolo'), 'roma'), false);
  assert.equal(conditionsHold(g, eventDef(g, 'a_popolo'), 'latini'), true);
  assert.equal(conditionsHold(g, eventDef(g, 'b_partita'), 'roma'), false);
  g.eventiFatti.c_sempre = ['roma'];
  assert.equal(conditionsHold(g, eventDef(g, 'c_sempre'), 'roma'), true);
});

test('ogni mese al più un evento nuovo per popolo, che resta in attesa', () => {
  const g = makeGame(1, [ev('a', { probabilita: 1, unaVolta: false }, [opt('x', [])]), ev('b', { probabilita: 1 }, [opt('x', [])])]);
  monthlyEvents(g);
  const attesa = Object.values(g.eventi);
  assert.equal(attesa.length, 4); // un evento per ognuno dei 4 popoli
  assert.ok(attesa.every(e => e.evento === 'a' && e.giorno === 0));
  assert.deepEqual(g.eventiFatti.a, ['roma', 'latini', 'volsci', 'siculi']);
  monthlyEvents(g); // tutti hanno già un evento in attesa
  assert.equal(Object.values(g.eventi).length, 4);
  const h = makeGame(1, [ev('a', { probabilita: 0.0000001 }, [opt('x', [])])]);
  monthlyEvents(h);
  assert.equal(Object.values(h.eventi).length, 0);
});

test('effetti: stabilità, tesoro in mesi, uomini, infamia, governo, slider', () => {
  const g = makeGame(1, [ev('e', { probabilita: 1, popoli: ['roma'] }, [opt('tutto', [
    { stabilita: 5 }, { tesoroMesi: -2 }, { uominiQuota: 0.25 }, { infamia: 3 }, { cambia_governo: 'repubblica' }, { slider: { societa: 2, guerra: -9 } }
  ])])]);
  const n = g.nazioni.roma, t0 = n.tesoro, u0 = n.uomini, entrate = monthlyIncome(g, 'roma'), max = maxManpower(g, 'roma');
  monthlyEvents(g);
  const pid = Object.keys(g.eventi)[0];
  assert.deepEqual(applyCommand(g, { tipo: 'scegli', nazione: 'roma', evento: pid, opzione: 'tutto' }), { ok: true });
  assert.equal(n.stabilita, 3);
  close(n.tesoro, t0 - 2 * Math.max(1, entrate));
  assert.equal(n.uomini, Math.min(max, Math.round(u0 + 0.25 * max))); // la riserva massima di prima della leva
  assert.equal(n.infamia, 3);
  assert.equal(n.governo, 'repubblica');
  assert.deepEqual(n.slider, { societa: 2, guerra: -5, governo: 0 });
  assert.equal(n.ultimoSlider, null); // l'evento non consuma la riforma
  assert.equal(g.eventi[pid], undefined);
  assert.ok(g.log.some(e => e.tipo === 'evento' && e.evento === 'e' && e.opzione === 'tutto'));
  assert.ok(g.log.some(e => e.tipo === 'governo' && e.governo === 'repubblica'));
});

test('effetti sull\'altro: relazione, pretesti, guerra senza perdere stabilità', () => {
  const g = makeGame(1, [ev('e', { probabilita: 1, popoli: ['roma'], altro: { preferiti: ['volsci'] } }, [opt('x', [
    { relazione: -40 }, { pretesto: true }, { pretestoAltro: true }, { guerra: true }
  ])])]);
  monthlyEvents(g);
  const pid = Object.keys(g.eventi)[0];
  assert.equal(g.eventi[pid].altro, 'volsci');
  chooseOption(g, 'roma', pid, 'x');
  assert.equal(relation(g, 'roma', 'volsci'), -40 - 100); // −40 dall'evento, −100 dalla guerra
  assert.equal(hasPretext(g, 'roma', 'volsci'), true);
  assert.equal(atWar(g, 'volsci', 'roma'), true);
  assert.equal(g.nazioni.volsci.stabilita, 0);
});

test('un altro morto nel frattempo: gli effetti su di lui si saltano', () => {
  const g = makeGame(1, [ev('e', { probabilita: 1, popoli: ['roma'], altro: { preferiti: ['volsci'] } }, [opt('x', [{ relazione: -40 }, { guerra: true }, { stabilita: 1 }])])]);
  monthlyEvents(g);
  const pid = Object.keys(g.eventi)[0];
  g.nazioni.volsci.vivo = false;
  assert.deepEqual(chooseOption(g, 'roma', pid, 'x'), { ok: true });
  assert.equal(g.nazioni.roma.stabilita, 1);
  assert.equal(atWar(g, 'volsci', 'roma'), false);
});

test('scelte non valide e scadenza: dopo 60 giorni decide la regola', () => {
  const g = makeGame(1, [ev('e', { probabilita: 1, popoli: ['roma'] }, [opt('buona', [{ stabilita: 1 }]), opt('cattiva', [{ stabilita: -1 }])])]);
  monthlyEvents(g);
  const pid = Object.keys(g.eventi)[0];
  assert.equal(applyCommand(g, { tipo: 'scegli', nazione: 'latini', evento: pid, opzione: 'buona' }).motivo, 'evento inesistente');
  assert.equal(applyCommand(g, { tipo: 'scegli', nazione: 'roma', evento: pid, opzione: 'boh' }).motivo, 'opzione inesistente');
  g.day = 60;
  expireEvents(g);
  assert.ok(g.eventi[pid]);
  g.day = 61;
  expireEvents(g);
  assert.equal(g.eventi[pid], undefined);
  assert.equal(g.nazioni.roma.stabilita, 1);
});

test('eventi orfani: popolo morto o evento tolto dal catalogo si scartano', () => {
  const g = makeGame(1, [ev('e', { probabilita: 1, popoli: ['roma', 'latini'] }, [opt('x', [])])]);
  monthlyEvents(g);
  const [p1, p2] = Object.keys(g.eventi);
  g.nazioni.roma.vivo = false;
  g.eventi[p2].evento = 'sparito';
  expireEvents(g);
  assert.deepEqual(g.eventi, {});
  assert.ok(p1);
});

test('riassunto degli effetti per Jev e per la finestra', () => {
  const g = makeGame();
  const e = { id: 'v1', evento: 'x', nazione: 'roma', altro: 'volsci', giorno: 0 };
  assert.equal(describeEffects(g, e, opt('a', [{ stabilita: 1 }, { tesoroMesi: -3 }, { uominiQuota: -0.2 }, { infamia: 2 }])),
    'stabilità +1, tesoro −3 mesi di entrate, riserva di uomini −20%, infamia +2');
  assert.equal(describeEffects(g, e, opt('b', [{ relazione: 40 }, { pretesto: true }, { pretestoAltro: true }, { guerra: true }])),
    'relazioni con volsci +40, pretesto contro volsci, volsci ottiene un pretesto contro di noi, volsci ci dichiara guerra');
  assert.equal(describeEffects(g, e, opt('c', [{ cambia_governo: 'repubblica' }, { slider: { societa: 1, guerra: -1 } }])),
    'governo: repubblica, società +1, dottrina −1');
  assert.equal(describeEffects(g, e, opt('d', [])), 'nessun effetto');
});

test('il giorno fa scattare gli eventi il primo del mese e li fa scadere', () => {
  const g = makeGame(1, [ev('e', { probabilita: 1, popoli: ['roma'] }, [opt('x', [{ stabilita: 1 }])])]);
  for (let i = 0; i < 12; i++) advanceDay(g);
  assert.equal(Object.values(g.eventi).length, 1);
  for (let i = 0; i < 70; i++) advanceDay(g);
  assert.equal(Object.values(g.eventi).length, 0);
  assert.equal(g.nazioni.roma.stabilita, 1);
});
