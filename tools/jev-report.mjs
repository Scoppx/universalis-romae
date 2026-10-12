// Riassunto di un registro di decisioni di Jev. Uso: node tools/jev-report.mjs registro.jsonl
import { readFileSync } from 'node:fs';
import { loadData } from './load-data.js';

const records = readFileSync(process.argv[2], 'utf8').trim().split('\n').map(l => JSON.parse(l));
const nomi = Object.fromEntries(loadData().popoli.popoli.map(p => [p.id, p.nome]));
const per = {};
for (const r of records) for (const d of r.domande) {
  const k = `${r.nazione}|${d.domanda}`;
  const a = (per[k] ??= { nazione: r.nazione, domanda: d.domanda, n: 0, fonti: {}, guerra: [], incerte: 0 });
  a.n++;
  a.fonti[d.fonte] = (a.fonti[d.fonte] ?? 0) + 1;
  if (d.fonte === 'prudenza') a.incerte++;
  if (d.domanda === 'guerra' && d.probabilita) a.guerra.push(1 - (d.probabilita['nessuna guerra'] ?? 0));
}
const media = l => (l.length ? l.reduce((s, x) => s + x, 0) / l.length : NaN);
console.log('popolo'.padEnd(16) + 'domanda'.padEnd(11) + 'n'.padStart(5) + '  P(guerra)  incerte  fonti');
const chiave = a => (a.guerra.length ? media(a.guerra) : -1); // righe senza domande di guerra in fondo
for (const a of Object.values(per).sort((x, y) => chiave(y) - chiave(x) || (x.nazione < y.nazione ? -1 : 1) || (x.domanda < y.domanda ? -1 : 1))) {
  const pg = a.guerra.length ? media(a.guerra).toFixed(2) : '   -';
  console.log(nomi[a.nazione].padEnd(16) + a.domanda.padEnd(11) + String(a.n).padStart(5) + `  ${pg.padStart(9)}  ${String(a.incerte).padStart(7)}  ${JSON.stringify(a.fonti)}`);
}
