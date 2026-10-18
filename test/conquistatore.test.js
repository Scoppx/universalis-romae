import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGame } from './fixtures.js';
import { conquerorController } from '../public/js/ai/conquistatore.js';

const guerre = cmds => cmds.filter(c => c.tipo === 'dichiara_guerra');

test('conquistatore: dichiara guerra come un giocatore anche con l\'infamia alta e nei primi anni', () => {
  const g = makeGame();
  g.day = 30;
  g.nazioni.roma.infamia = 50; // l'IA a regole qui si fermerebbe; un giocatore no
  g.nazioni.roma.stabilita = 1;
  assert.deepEqual(guerre(conquerorController(g, 'roma')), [{ tipo: 'dichiara_guerra', nazione: 'roma', contro: 'volsci' }]);
});

test('conquistatore: senza pretesto non attacca con la stabilità negativa', () => {
  const g = makeGame();
  g.day = 30;
  g.nazioni.roma.stabilita = -1;
  assert.deepEqual(guerre(conquerorController(g, 'roma')), []);
});
