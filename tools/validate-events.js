// Controlla il catalogo degli eventi. Uso: npm run validate-events
import { loadData } from './load-data.js';
import { validateEvents } from '../public/js/sim/validate-events.js';

const data = loadData();
const errori = validateEvents(data.catalogo, data);
for (const e of errori) console.error(e);
console.log(errori.length ? `${errori.length} errori` : `${data.catalogo.length} eventi validi`);
process.exit(errori.length ? 1 : 0);
