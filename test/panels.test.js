import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esercitiHtml, provinceHtml, rankingHtml, governoHtml, eventoHtml } from '../public/js/ui/panels.js';

const evil = '<img src=x onerror=alert(1)>';

test('ogni valore inserito nell\'HTML è protetto, anche i "numeri"', () => {
  const a = esercitiHtml([{ id: 'e1', provincia: 'Roma', fanteria: evil, cavalleria: evil, morale: '3.0', destinazione: null, inBattaglia: false }], { puoUnire: false, puoDividere: false });
  assert.equal(a.includes('<img'), false);
  const p = provinceHtml({
    id: 'roma', nome: 'Roma', proprietario: { id: 'roma', nome: 'Roma' }, occupante: null, cultura: 'latina',
    terreno: 'collina', tasse: 5, uomini: 5, fort: 2, puoReclutare: false,
    malcontento: evil, assimilazione: evil, colonia: true,
    azioni: { colonia: { costo: evil, uomini: evil, motivo: evil }, fortifica: { costo: evil, motivo: null } },
    eserciti: [{ id: 'e1', nazione: 'Roma', mio: false, uomini: evil, morale: '3.0' }]
  });
  assert.equal(p.includes('<img'), false);
  const gov = governoHtml({
    nome: evil, governo: evil, effettiGoverno: evil, stabilita: evil, tratti: evil, costoStabilita: evil, puoAlzare: false,
    slider: [{ quale: evil, nome: evil, sinistra: evil, destra: evil, valore: evil, meno: evil, piu: null }]
  });
  assert.equal(gov.includes('<img'), false);
  assert.equal(eventoHtml({ id: evil, titolo: evil, testo: evil, opzioni: [{ id: evil, testo: evil, effetti: evil }] }).includes('<img'), false);
  assert.equal(rankingHtml('Fine', [{ pos: 1, nome: 'Roma', punteggio: evil, vivo: true, tu: true }]).includes('<img'), false);
});
