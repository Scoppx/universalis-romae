import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { applyCommand } from '../public/js/sim/commands.js';
import { malcontent, assimilationRate, monthlyCulture, colonyCost, checkColony, checkFortify, fortCost, overextension } from '../public/js/sim/culture.js';
import { advanceDay } from '../public/js/sim/loop.js';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('malcontento: cultura diversa, stabilità negativa, accentramento, colonia', () => {
  const g = makeGame();
  assert.equal(malcontent(g, 'b'), 0);
  g.province.b.cultura = 'volsca';
  assert.equal(malcontent(g, 'b'), 3);
  g.nazioni.roma.stabilita = -2;
  assert.equal(malcontent(g, 'b'), 5);
  g.nazioni.roma.slider.governo = -5;
  assert.equal(malcontent(g, 'b'), 6);
  g.nazioni.roma.slider.governo = 5;
  assert.equal(malcontent(g, 'b'), 4);
  g.province.b.colonia = 'roma';
  assert.equal(malcontent(g, 'b'), 3);
  g.province.b.colonia = 'volsci'; // la colonia di un padrone vecchio non conta
  assert.equal(malcontent(g, 'b'), 4);
});

test('assimilazione: circa 15 anni, più veloce con accentramento, tratto e colonia', () => {
  const g = makeGame();
  close(assimilationRate(g, 'b'), 100 / 180);
  g.nazioni.roma.slider.governo = -5;
  close(assimilationRate(g, 'b'), 100 / 180 * 1.5);
  g.nazioni.roma.tratti.assimilazione = 0.5;
  g.province.b.colonia = 'roma';
  close(assimilationRate(g, 'b'), 100 / 180 * 1.5 * 1.5 * 2);
  g.nazioni.roma.slider.governo = 5;
  g.nazioni.roma.tratti.assimilazione = 0;
  g.province.b.colonia = null;
  close(assimilationRate(g, 'b'), 100 / 180 * 0.5);
});

test('ogni mese la provincia straniera si assimila; a 100 prende la cultura del padrone', () => {
  const g = makeGame();
  g.province.b.cultura = 'volsca';
  for (let i = 0; i < 179; i++) monthlyCulture(g);
  assert.equal(g.province.b.cultura, 'volsca');
  assert.ok(g.province.b.assimilazione > 99);
  monthlyCulture(g);
  assert.equal(g.province.b.cultura, 'latina');
  assert.equal(g.province.b.assimilazione, 0);
  assert.ok(g.log.some(e => e.tipo === 'assimilata' && e.prov === 'b'));
});

test('l\'assimilazione si azzera quando la provincia cambia padrone, e si ferma se è occupata', () => {
  const g = makeGame();
  g.province.b.cultura = 'volsca';
  for (let i = 0; i < 12; i++) monthlyCulture(g);
  const dopoUnAnno = g.province.b.assimilazione;
  g.province.b.controller = 'volsci';
  monthlyCulture(g);
  assert.equal(g.province.b.assimilazione, dopoUnAnno);
  g.province.b.owner = 'latini';
  g.province.b.controller = 'latini';
  monthlyCulture(g);
  close(g.province.b.assimilazione, assimilationRate(g, 'b'));
  assert.equal(g.province.b.assimilazioneDi, 'latini');
});

test('colonia: costa denaro e uomini, solo in provincia propria di altra cultura', () => {
  const g = makeGame();
  const n = g.nazioni.roma;
  assert.equal(checkColony(g, 'roma', 'b'), 'è già della tua cultura');
  assert.equal(checkColony(g, 'roma', 'c'), 'provincia non tua');
  g.province.b.cultura = 'volsca';
  assert.equal(colonyCost(g, 'b'), 10 + 3 * 2);
  n.tesoro = 0;
  assert.equal(checkColony(g, 'roma', 'b'), 'denaro insufficiente');
  n.tesoro = 100; n.uomini = 999;
  assert.equal(checkColony(g, 'roma', 'b'), 'uomini insufficienti');
  n.uomini = 1500;
  assert.deepEqual(applyCommand(g, { tipo: 'colonia', nazione: 'roma', provincia: 'b' }), { ok: true });
  assert.equal(g.province.b.colonia, 'roma');
  assert.equal(n.tesoro, 84);
  assert.equal(n.uomini, 500);
  assert.equal(checkColony(g, 'roma', 'b'), 'colonia già fondata');
});

test('fortificazione: livelli fino a 3, costo crescente', () => {
  const g = makeGame();
  const n = g.nazioni.roma;
  n.tesoro = 200;
  assert.equal(fortCost(g, 'b'), 15);
  assert.deepEqual(applyCommand(g, { tipo: 'fortifica', nazione: 'roma', provincia: 'b' }), { ok: true });
  assert.equal(g.province.b.fort, 1);
  assert.equal(n.tesoro, 185);
  applyCommand(g, { tipo: 'fortifica', nazione: 'roma', provincia: 'b' });
  applyCommand(g, { tipo: 'fortifica', nazione: 'roma', provincia: 'b' });
  assert.equal(g.province.b.fort, 3);
  assert.equal(n.tesoro, 200 - 15 - 30 - 60);
  assert.equal(fortCost(g, 'b'), null);
  assert.equal(checkFortify(g, 'roma', 'b'), 'fortificazione al massimo');
  assert.equal(checkFortify(g, 'roma', 'c'), 'provincia non tua');
  n.tesoro = 0;
  assert.equal(checkFortify(g, 'roma', 'a'), 'denaro insufficiente');
});

test('il ciclo del giorno fa girare la cultura il primo del mese', () => {
  const g = makeGame();
  g.province.b.cultura = 'volsca';
  for (let i = 0; i < 40; i++) advanceDay(g);
  assert.ok(g.province.b.assimilazione > 0);
});

test('sovraestensione: oltre 15 province le terre di altra cultura sono più scontente', () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  Object.assign(g.balance.sovraestensione, { soglia: 15, perProvincia: 0.15, massimo: 3 }); // misura la formula, non la taratura
  g.province.b.cultura = 'volsca';
  const base = malcontent(g, 'b');
  const conta = n => { g.province.zz && 0; return overextension(g, 'roma', n); };
  assert.equal(conta(14), 0);
  assert.equal(conta(16), 0.15);
  assert.equal(conta(40), 3);
  // con le province vere: 2 province, nessun effetto
  assert.equal(malcontent(g, 'b'), base);
  for (let i = 0; i < 18; i++) g.province[`x${i}`] = { id: `x${i}`, nome: 'X', owner: 'roma', controller: 'roma', cultura: 'latina', terreno: 'pianura', tasse: 1, uomini: 1, fort: 0, vicini: [] };
  assert.equal(malcontent(g, 'b'), Math.round((base + 0.15 * 5) * 10) / 10); // 20 province: 5 oltre la soglia
  assert.equal(malcontent(g, 'a'), 0); // stessa cultura: nessun effetto
});
