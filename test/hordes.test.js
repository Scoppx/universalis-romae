import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { loadData } from '../tools/load-data.js';
import { createGame } from '../public/js/sim/setup.js';
import { armiesOf } from '../public/js/sim/state.js';
import { checkSurvival, declareWar, proposePeace } from '../public/js/sim/war.js';
import { monthlyUpkeep } from '../public/js/sim/economy.js';
import { fallProvince } from '../public/js/sim/siege.js';
import { validateEvents } from '../public/js/sim/validate-events.js';
import { activateHorde, isHorde } from '../public/js/sim/hordes.js';

// fixture: roma a, b; volsci c, f; latini d, e; siculi g. L'orda dei galli punta a c, f ed entra da g.
const conOrda = () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.orde = { eserciti: 3, fanteria: 7000, cavalleria: 1000, insediamento: 2, saccheggio: 6 };
  g.ambizioni = { regioni: { orda_galli: { nome: 'le terre dei Volsci', province: ['c', 'f'] } }, popoli: {}, orde: { galli: { regione: 'orda_galli', ingresso: 'g' } } };
  g.dormienti.galli = { id: 'galli', nome: 'Galli', colore: '#777', cultura: 'gallica', governo: 'tribù', capitale: 'f', tratti: {}, difficolta: 'normale' };
  return g;
};

test('orda: nasce senza province, con i suoi eserciti all\'ingresso, e non muore per questo', () => {
  const g = conOrda();
  assert.equal(activateHorde(g, 'galli'), 'galli');
  checkSurvival(g);
  const n = g.nazioni.galli;
  assert.equal(n.vivo, true);
  assert.ok(isHorde(g, 'galli') && !isHorde(g, 'roma'));
  assert.deepEqual(n.orda, { regione: 'orda_galli', prima: null });
  const es = armiesOf(g, 'galli');
  assert.equal(es.length, 3);
  assert.ok(es.every(a => a.prov === 'g' && a.fanteria === 7000 && a.cavalleria === 1000));
  assert.equal(monthlyUpkeep(g, 'galli'), 0);
  assert.equal(g.dormienti.galli, undefined);
  assert.ok(g.log.some(e => e.tipo === 'orda' && e.nazione === 'galli' && e.prov === 'g'));
  assert.equal(activateHorde(g, 'galli'), null); // non è più dormiente
});

test('orda: senza eserciti sparisce', () => {
  const g = conOrda();
  activateHorde(g, 'galli');
  for (const a of armiesOf(g, 'galli')) delete g.eserciti[a.id];
  checkSurvival(g);
  assert.equal(g.nazioni.galli.vivo, false);
});

test('orda: niente pace finché è un\'orda', () => {
  const g = conOrda();
  activateHorde(g, 'galli');
  const { guerra } = declareWar(g, 'galli', 'siculi');
  assert.deepEqual(proposePeace(g, 'siculi', guerra, { ricevente: 'siculi', province: [] }), { ok: false, motivo: "un'orda non tratta" });
  assert.equal(g.nazioni.galli.stabilita, 0); // l'orda non perde stabilità a dichiarare guerra
});

test('orda: saccheggia e si stabilisce dopo due province della regione', () => {
  const g = conOrda();
  activateHorde(g, 'galli');
  declareWar(g, 'galli', 'roma'); declareWar(g, 'galli', 'volsci');
  fallProvince(g, g.province.b, 'galli'); // fuori regione
  assert.ok(g.nazioni.galli.tesoro > 0);
  assert.ok(isHorde(g, 'galli'));
  fallProvince(g, g.province.f, 'galli');
  assert.equal(g.nazioni.galli.orda.prima, 'f');
  fallProvince(g, g.province.c, 'galli');
  assert.equal(g.nazioni.galli.orda, null);
  assert.equal(g.province.f.owner, 'galli');
  assert.equal(g.province.c.owner, 'galli');
  assert.equal(g.nazioni.galli.capitale, 'f');
  assert.equal(g.province.b.owner, 'roma'); // fuori regione: solo controllata
  assert.equal(g.province.b.controller, 'galli');
  assert.ok(g.log.some(e => e.tipo === 'insediamento' && e.nazione === 'galli' && e.prov === 'f'));
  assert.equal(g.nazioni.volsci.vivo, false); // ha perso le sue due province
});

test('evento d\'invasione: crea l\'orda con i dati veri', () => {
  const data = loadData();
  assert.deepEqual(validateEvents(data.catalogo, data), []);
  const def = data.catalogo.find(e => e.id === 'invasione_insubri');
  assert.ok(def.opzioni.some(o => o.effetti.some(e => e.orda?.popolo === 'insubri')));
  const g = createGame({ ...data, seed: 1 });
  activateHorde(g, 'insubri');
  assert.ok(armiesOf(g, 'insubri').every(a => a.prov === 'eporedia'));
});

import { hordeOrders } from '../public/js/ai/orda.js';
import { buildControllers } from '../public/js/ai/modes.js';
import { rulesController } from '../public/js/ai/rules.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { advanceDay } from '../public/js/sim/loop.js';
import { dayFromDate } from '../public/js/sim/calendar.js';
import { provincesOf } from '../public/js/sim/state.js';

const giornoOrdini = (g, id) => { for (let i = 0; i < 14 && !hordeOrders(g, id).length; i++) g.day++; };

test('orda IA: dichiara guerra solo al padrone della prossima provincia e marcia', () => {
  const g = conOrda();
  g.ambizioni.regioni.orda_galli.province = ['b']; // da g a b passando per f (volsci) e c (volsci) o e (latini)
  activateHorde(g, 'galli');
  giornoOrdini(g, 'galli');
  const cmds = hordeOrders(g, 'galli');
  const guerre = cmds.filter(c => c.tipo === 'dichiara_guerra');
  assert.deepEqual(guerre, [{ tipo: 'dichiara_guerra', nazione: 'galli', contro: 'volsci' }]);
  for (const c of cmds) applyCommand(g, c);
  const es = Object.values(g.eserciti).filter(a => a.owner === 'galli');
  assert.ok(es.some(a => a.percorso.length && a.percorso[0] === 'f'), 'in marcia verso f');
  assert.equal(g.nazioni.galli.stabilita, 0);
});

test('orda IA: con Jev resta a regole', () => {
  const g = conOrda();
  activateHorde(g, 'galli');
  const finto = { controller: () => [] };
  assert.equal(buildControllers(g, 'jev', finto).galli, rulesController);
});

test('orda IA: se marcia su un alleato del giocatore, il giocatore difende per l\'alleanza e lo sa', async () => {
  const { importantNews } = await import('../public/js/ui/views.js');
  const g = conOrda();
  g.giocatore = 'roma';
  g.nazioni.roma.alleati.push('volsci'); g.nazioni.volsci.alleati.push('roma');
  activateHorde(g, 'galli');
  giornoOrdini(g, 'galli');
  g.log = [];
  for (const c of hordeOrders(g, 'galli')) applyCommand(g, c);
  const w = Object.values(g.guerre).find(x => x.attaccanti[0] === 'galli');
  assert.deepEqual(w.difensori, ['volsci', 'roma']);
  assert.ok(importantNews(g.log, g, 'roma').some(t => t.includes('dichiara guerra')));
});

test('orda IA: arriva, assedia e si stabilisce in una partita headless', () => {
  const data = loadData();
  const g = createGame({ ...data, seed: 1 });
  g.day = dayFromDate({ year: 400, month: 1, day: 1 });
  const c = buildControllers(g, 'regole', null);
  activateHorde(g, 'insubri');
  c.insubri = rulesController;
  for (let i = 0; i < 10 * 365 && g.nazioni.insubri.orda; i++) advanceDay(g, c);
  assert.equal(g.nazioni.insubri.vivo, true);
  assert.equal(g.nazioni.insubri.orda, null);
  assert.ok(provincesOf(g, 'insubri').length >= 2);
});
