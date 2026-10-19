import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { dayFromDate } from '../public/js/sim/calendar.js';
import { score } from '../public/js/sim/score.js';
import { ambitionOf, ambitionStatus, monthlyAmbitions } from '../public/js/sim/ambitions.js';

// fixture: roma a, b; volsci c, f; latini d, e; siculi g
const conAmbizioni = () => {
  const g = makeGame();
  g.balance = structuredClone(g.balance);
  g.balance.ambizioni = { bonusSopravvivenza: 15, bonusRegione: 30, quotaRegione: 0.75, preferenzaRegione: 1.5, prudenza: 1.5 };
  g.ambizioni = {
    regioni: { lazio: { nome: 'il Lazio', province: ['a', 'b', 'd', 'e'] } },
    popoli: { volsci: { tipo: 'sopravvivere', anno: 700 }, roma: { tipo: 'regione', regione: 'lazio' } },
    orde: {}
  };
  return g;
};
const ambizioniLog = g => g.log.filter(e => e.tipo === 'ambizione');

test('sopravvivere: raggiunta all\'anno, una volta sola, bonus nel punteggio', () => {
  const g = conAmbizioni();
  g.day = dayFromDate({ year: 701, month: 1, day: 1 });
  monthlyAmbitions(g);
  assert.equal(g.nazioni.volsci.ambizioneRaggiunta, null);
  assert.equal(ambitionStatus(g, 'volsci').anniMancanti, 1);
  const prima = score(g, 'volsci');
  g.day = dayFromDate({ year: 700, month: 1, day: 1 });
  monthlyAmbitions(g);
  assert.equal(g.nazioni.volsci.ambizioneRaggiunta, g.day);
  assert.equal(ambizioniLog(g).length, 1);
  assert.equal(score(g, 'volsci'), prima + 15);
  g.log = [];
  monthlyAmbitions(g);
  assert.equal(ambizioniLog(g).length, 0);
});

test('regione: 75% delle tasse e la capitale; il bonus resta se poi si perde', () => {
  const g = conAmbizioni();
  // lazio: a 4, b 2, d 3, e 2 → 11; roma ha 6 (55%)
  monthlyAmbitions(g);
  assert.equal(g.nazioni.roma.ambizioneRaggiunta, null);
  assert.deepEqual({ ...ambitionStatus(g, 'roma'), quota: Math.round(ambitionStatus(g, 'roma').quota * 100) },
    { tipo: 'regione', raggiunta: false, giaRaggiunta: false, quota: 55, possedute: 2, totale: 4 });
  g.nazioni.roma.capitale = 'b';
  g.province.d.owner = 'roma'; g.province.e.owner = 'roma'; g.province.b.owner = 'latini'; // a, d, e: 9/11 = 82%, senza capitale
  monthlyAmbitions(g);
  assert.equal(g.nazioni.roma.ambizioneRaggiunta, null);
  g.province.b.owner = 'roma'; // a, b, d, e: 100% e capitale
  monthlyAmbitions(g);
  assert.equal(g.nazioni.roma.ambizioneRaggiunta, g.day);
  const con = score(g, 'roma');
  g.province.d.owner = 'latini';
  monthlyAmbitions(g);
  assert.equal(score(g, 'roma'), con - g.province.d.tasse - g.balance.punteggio.culturaPropria);
  assert.ok(g.nazioni.roma.ambizioneRaggiunta !== null);
});

test('popolo senza ambizione: nessun errore', () => {
  const g = conAmbizioni();
  assert.equal(ambitionOf(g, 'siculi'), null);
  assert.equal(ambitionStatus(g, 'siculi'), null);
  const s = score(g, 'siculi');
  monthlyAmbitions(g);
  assert.equal(score(g, 'siculi'), s);
  const h = makeGame(); // nessun dato delle ambizioni
  assert.equal(ambitionOf(h, 'roma'), null);
  monthlyAmbitions(h);
});
