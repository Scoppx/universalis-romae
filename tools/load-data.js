// Carica i dati reali del gioco in Node (bench e test).
import { readFileSync } from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url)));

export function loadData() {
  return { map: read('map.json'), popoli: read('popoli.json'), balance: read('balance.json') };
}
