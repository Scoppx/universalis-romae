import { test } from 'node:test';
import assert from 'node:assert/strict';
import { esercitiHtml, provinceHtml, rankingHtml } from '../public/js/ui/panels.js';

const evil = '<img src=x onerror=alert(1)>';

test('ogni valore inserito nell\'HTML è protetto, anche i "numeri"', () => {
  const a = esercitiHtml([{ id: 'e1', provincia: 'Roma', fanteria: evil, cavalleria: evil, morale: '3.0', destinazione: null, inBattaglia: false }], { puoUnire: false, puoDividere: false });
  assert.equal(a.includes('<img'), false);
  const p = provinceHtml({
    id: 'roma', nome: 'Roma', proprietario: { id: 'roma', nome: 'Roma' }, occupante: null, cultura: 'latina',
    terreno: 'collina', tasse: 5, uomini: 5, fort: 2, puoReclutare: false,
    eserciti: [{ id: 'e1', nazione: 'Roma', mio: false, uomini: evil, morale: '3.0' }]
  });
  assert.equal(p.includes('<img'), false);
  assert.equal(rankingHtml('Fine', [{ pos: 1, nome: 'Roma', punteggio: evil, vivo: true, tu: true }]).includes('<img'), false);
});
