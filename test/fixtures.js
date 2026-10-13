// Mappa minima per i test:
//   a(roma) - b(roma) - c(volsci)
//     |         |         |
//   d(latini)- e(latini)- f(volsci) ~stretto~ g(siculi)
import { readFileSync } from 'node:fs';
import { createGame } from '../public/js/sim/setup.js';

export const balance = JSON.parse(readFileSync(new URL('../public/data/balance.json', import.meta.url)));

const P = (id, owner, cultura, terreno, tasse, uomini, fort, vicini) =>
  ({ id, nome: id.toUpperCase(), owner, cultura, terreno, tasse, uomini, fort, centro: [0, 0], poligoni: [], vicini });

export const fixtureMap = {
  width: 100, height: 100,
  province: [
    P('a', 'roma', 'latina', 'pianura', 4, 4, 1, ['b', 'd']),
    P('b', 'roma', 'latina', 'collina', 2, 2, 0, ['a', 'c', 'e']),
    P('c', 'volsci', 'volsca', 'montagna', 1, 2, 0, ['b', 'f']),
    P('d', 'latini', 'latina', 'pianura', 3, 2, 0, ['a', 'e']),
    P('e', 'latini', 'latina', 'collina', 2, 2, 1, ['d', 'b', 'f']),
    P('f', 'volsci', 'volsca', 'montagna', 1, 1, 0, ['e', 'c', 'g']),
    P('g', 'siculi', 'sicula', 'pianura', 2, 2, 0, ['f'])
  ],
  stretti: [['f', 'g']],
  decorazioni: []
};

// governo senza effetti: i conti dei test delle tappe precedenti restano validi
const N = (id, cultura, capitale, tratti = {}, extra = {}) =>
  ({ id, nome: id, colore: '#888888', cultura, governo: 'neutro', capitale, difficolta: 'normale', tratti, carattere: '', ...extra });

export const fixturePopoli = {
  popoli: [
    N('roma', 'latina', 'a', { reclute: 0.3 }),
    N('latini', 'latina', 'd'),
    N('volsci', 'volsca', 'c', { montagna: 1 }),
    N('siculi', 'sicula', 'g'),
    N('taranto', 'greca', 'g', {}, { dormiente: true })
  ]
};

export function makeGame(seed = 1) {
  return createGame({ map: fixtureMap, popoli: fixturePopoli, balance, seed });
}
