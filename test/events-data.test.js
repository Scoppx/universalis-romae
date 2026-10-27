import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadData } from '../tools/load-data.js';
import { validateEvents } from '../public/js/sim/validate-events.js';

const data = loadData();
const buono = () => ({
  id: 'prova', titolo: 'Prova', testo: 'Un testo.', condizioni: { probabilita: 0.01, anni: [700, 600], altro: {} },
  opzioni: [{ id: 'a', testo: 'A', effetti: [{ stabilita: 1 }, { relazione: 10 }] }], regola: 'a'
});

test('il catalogo vero è valido e copre i 13 dormienti', () => {
  assert.deepEqual(validateEvents(data.catalogo, data), []);
  assert.ok(data.catalogo.length >= 35, String(data.catalogo.length));
  const dormienti = data.popoli.popoli.filter(p => p.dormiente).map(p => p.id);
  for (const d of dormienti) {
    assert.ok(data.catalogo.some(e => e.opzioni.some(o => o.effetti.some(x => (x.crea_popolo ?? x.orda)?.popolo === d))), d); // i Galli arrivano come orde
  }
});

test('il validatore trova gli errori', () => {
  assert.deepEqual(validateEvents([buono()], data), []);
  const casi = [
    [e => { e.id = 'Con Spazi'; }, /id/],
    [e => { e.condizioni.probabilita = 0; }, /probabilita/],
    [e => { e.condizioni.anni = [600, 700]; }, /anni/],
    [e => { e.condizioni.popoli = ['atlantide']; }, /popolo/],
    [e => { e.condizioni.governi = ['impero']; }, /governo/],
    [e => { e.condizioni.provincia = 'nessuna'; }, /provincia/],
    [e => { e.condizioni.unaVolta = 'mai'; }, /unaVolta/],
    [e => { e.opzioni[0].effetti.push({ magia: 1 }); }, /effetto/],
    [e => { e.opzioni[0].effetti.push({ stabilita: 1, tesoroMesi: 1 }); }, /effetto/],
    [e => { delete e.condizioni.altro; }, /altro/],
    [e => { e.opzioni[0].effetti.push({ crea_popolo: { popolo: 'roma' } }); }, /dormiente/],
    [e => { e.opzioni[0].effetti.push({ cambia_governo: 'impero' }); }, /governo/],
    [e => { e.opzioni[0].effetti.push({ slider: { morale: 1 } }); }, /slider/],
    [e => { e.regola = 'z'; }, /regola/],
    [e => { e.opzioni = []; }, /opzioni/]
  ];
  for (const [rompi, atteso] of casi) {
    const e = buono();
    rompi(e);
    const err = validateEvents([e], data);
    assert.ok(err.some(x => atteso.test(x)), `${atteso}: ${err.join(' | ')}`);
  }
  assert.ok(validateEvents([buono(), buono()], data).some(x => /ripetuto/.test(x)));
});
