import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { monthlyIncome } from '../public/js/sim/economy.js';
import { relation } from '../public/js/sim/diplomacy.js';
import { armiesOf } from '../public/js/sim/state.js';
import { orderMove, advanceMovement } from '../public/js/sim/armies.js';
import {
  declareWar, warscore, scoreFor, peaceCost, makePeace, proposePeace, answerProposal, expireProposals, atWar, validTerms, annexable
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
  assert.equal(g.nazioni.roma.infamia, g.balance.infamia.perProvincia + g.balance.infamia.culturaDiversa); // provincia di cultura diversa
  assert.equal(g.nazioni.volsci.capitale, 'f');
  assert.equal(g.nazioni.roma.tregue.volsci, g.day + g.balance.guerra.tregua);
  assert.equal(g.nazioni.volsci.tregue.roma, g.day + g.balance.guerra.tregua);
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
  assert.match(validTerms(g, w, 'roma', { province: ['d', 'e'] }), /^troppe province di latini per una pace \(al più 1\)/); // 2 su 2
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

test('alla pace ogni provincia va all\'alleato che la occupa', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.guerra.quotaPace = 1;
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.guerre[guerra].attaccanti.push('latini');
  g.province.c.controller = 'latini';
  g.province.f.controller = 'roma';
  const inf = g.nazioni.latini.infamia;
  assert.deepEqual(makePeace(g, guerra, 'roma', { province: ['c', 'f'] }), { ok: true });
  assert.equal(g.province.c.owner, 'latini');
  assert.equal(g.province.f.owner, 'roma');
  assert.ok(g.nazioni.latini.infamia > inf);
  const e = g.log.find(x => x.tipo === 'pace');
  assert.deepEqual(e.padroni, ['latini', 'roma']);
});

test('capitale salva per i popoli facili: né in pace né con un ultimatum', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.guerra.quotaPace = 1;
  g.balance.difficolta.facile = { capitaleSalva: true };
  g.nazioni.roma.difficolta = 'facile';
  const { guerra } = declareWar(g, 'volsci', 'roma');
  g.province.a.controller = 'volsci';
  g.province.b.controller = 'volsci';
  assert.equal(validTerms(g, g.guerre[guerra], 'volsci', { province: ['a'] }), 'la capitale non si può cedere');
  assert.equal(validTerms(g, g.guerre[guerra], 'volsci', { province: ['b'] }), null);
  g.nazioni.roma.difficolta = 'normale';
  assert.equal(validTerms(g, g.guerre[guerra], 'volsci', { province: ['a'] }), null);
});

test('annessione: tutte le province del popolo occupate dal tuo schieramento, senza limite di quota', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.guerra.quotaPace = 0.5;
  const { guerra } = declareWar(g, 'roma', 'volsci');
  const w = g.guerre[guerra];
  w.attaccanti.push('latini');
  g.province.c.controller = 'roma';
  assert.equal(annexable(g, w, 'roma', 'volsci'), 'non tutte le province di volsci sono occupate');
  g.province.f.controller = 'latini';
  assert.equal(annexable(g, w, 'roma', 'volsci'), null);
  assert.equal(validTerms(g, w, 'roma', { province: ['c', 'f'] }), 'troppe province di volsci per una pace (al più 1): togline qualcuna, oppure annetti tutto il popolo');
  const r = proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c', 'f'], annessione: 'volsci' });
  assert.equal(r.ok, true, r.motivo);
  assert.equal(g.proposte[r.proposta].termini.annessione, 'volsci');
  assert.deepEqual(answerProposal(g, 'volsci', r.proposta, true), { ok: true, accettata: true });
  assert.equal(g.nazioni.volsci.vivo, false);
  assert.equal(g.province.c.owner, 'roma');
  assert.equal(g.province.f.owner, 'latini');
});

test('annessione: non con una capitale salva, non con una lista diversa dalle province del popolo', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.difficolta.facile = { capitaleSalva: true };
  g.nazioni.roma.difficolta = 'facile';
  const { guerra } = declareWar(g, 'volsci', 'roma');
  const w = g.guerre[guerra];
  g.province.a.controller = 'volsci';
  g.province.b.controller = 'volsci';
  assert.equal(annexable(g, w, 'volsci', 'roma'), 'la capitale non si può cedere');
  g.nazioni.roma.difficolta = 'normale';
  assert.equal(annexable(g, w, 'volsci', 'roma'), null);
  assert.equal(validTerms(g, w, 'volsci', { province: ['a'], annessione: 'roma' }), 'un\'annessione prende tutte le province del popolo');
  assert.equal(validTerms(g, w, 'volsci', { province: ['a', 'b'], annessione: 'latini' }), 'un\'annessione prende tutte le province del popolo');
});

test('pace con denari: costo nel punteggio, limite del tesoro, pagamento alla firma', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.guerra.quotaPace = 1;
  const { guerra } = declareWar(g, 'roma', 'volsci');
  const w = g.guerre[guerra];
  g.nazioni.volsci.tesoro = 50;
  const anno = 12 * Math.max(1, monthlyIncome(g, 'volsci'));
  assert.ok(Math.abs(peaceCost(g, w, 'roma', { province: [], denari: 10 }) - 100 * 10 / (2 * anno)) < 1e-9);
  assert.equal(proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: [], denari: 60 }).motivo, 'al più 50 denari: è quanto ha volsci nel tesoro');
  assert.equal(proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: [], denari: -5 }).motivo, 'termini non validi');
  g.province.c.controller = 'roma';
  const t0 = g.nazioni.roma.tesoro;
  const r = proposePeace(g, 'roma', guerra, { ricevente: 'roma', province: ['c'], denari: 20 });
  assert.equal(g.proposte[r.proposta].termini.denari, 20);
  g.nazioni.volsci.tesoro = 15; // nel frattempo ha speso: paga quello che ha
  assert.deepEqual(answerProposal(g, 'volsci', r.proposta, true), { ok: true, accettata: true });
  assert.ok(Math.abs(g.nazioni.roma.tesoro - (t0 + 15)) < 1e-9);
  assert.equal(g.nazioni.volsci.tesoro, 0);
  const e = g.log.find(x => x.tipo === 'pace');
  assert.equal(e.denari, 15);
  assert.equal(e.pagatore, 'volsci');
});

test('il capofila sceglie chi riceve ogni provincia: un alleato che la occupava se la lega al dito', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.guerra.quotaPace = 1;
  const { guerra } = declareWar(g, 'roma', 'volsci');
  const w = g.guerre[guerra];
  w.attaccanti.push('latini');
  g.province.c.controller = 'latini';
  g.province.f.controller = 'roma';
  assert.equal(validTerms(g, w, 'roma', { province: ['c'], assegna: { c: 'siculi' } }), 'chi riceve una provincia deve essere del tuo schieramento');
  assert.equal(validTerms(g, w, 'roma', { province: ['c'], assegna: { f: 'roma' } }), 'termini non validi');
  const rel = relation(g, 'roma', 'latini');
  assert.deepEqual(makePeace(g, guerra, 'roma', { province: ['c', 'f'], assegna: { c: 'roma' } }), { ok: true });
  assert.equal(g.province.c.owner, 'roma');
  assert.equal(g.province.c.controller, 'roma');
  assert.equal(relation(g, 'roma', 'latini'), rel - g.balance.guerra.presaAlleato);
  assert.deepEqual(g.log.find(e => e.tipo === 'pace').padroni, ['roma', 'roma']);
});

test('annessione: infamia doppia rispetto a una pace normale', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  const { guerra } = declareWar(g, 'roma', 'volsci');
  g.province.c.controller = 'roma'; g.province.f.controller = 'roma';
  const inf = g.balance.infamia, per = inf.perProvincia + inf.culturaDiversa;
  makePeace(g, guerra, 'roma', { province: ['c', 'f'], annessione: 'volsci' });
  assert.equal(g.nazioni.roma.infamia, 2 * per * g.balance.annessione.infamia);
});
