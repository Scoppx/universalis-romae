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
