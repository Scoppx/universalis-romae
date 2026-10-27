// Carica i dati reali del gioco in Node (bench e test), compreso il catalogo degli eventi.
import { readFileSync } from 'node:fs';

const read = name => JSON.parse(readFileSync(new URL(`../public/data/${name}`, import.meta.url)));

export const EVENTI_FILE = ['generici', 'governo', 'storici', 'dormienti'];

export function loadData() {
  return {
    map: read('map.json'), popoli: read('popoli.json'), balance: read('balance.json'), ambizioni: read('ambizioni.json'),
    catalogo: EVENTI_FILE.flatMap(f => read(`eventi/${f}.json`).eventi)
  };
}
