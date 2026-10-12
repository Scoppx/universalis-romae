// Partite headless con l'IA a regole per tutti. Uso: node bench.js [anni=100] [semi=5]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadData } from './tools/load-data.js';
import { createGame } from './public/js/sim/setup.js';
import { advanceDay } from './public/js/sim/loop.js';
import { provincesOf } from './public/js/sim/state.js';
import { score } from './public/js/sim/score.js';
import { rulesController } from './public/js/ai/rules.js';

export function runBench({ anni, semi }) {
  const data = loadData();
  const info = Object.fromEntries(data.popoli.popoli.map(p => [p.id, p]));
  const acc = {};
  for (let seed = 1; seed <= semi; seed++) {
    const game = createGame({ ...data, seed });
    const controllers = Object.fromEntries(game.ordine.map(id => [id, rulesController]));
    const start = Object.fromEntries(game.ordine.map(id => [id, provincesOf(game, id).length]));
    for (let d = 0; d < anni * 365; d++) advanceDay(game, controllers);
    for (const id of game.ordine) {
      const a = (acc[id] ??= { vivo: 0, provinceInizio: 0, provinceFine: 0, punteggio: 0 });
      a.vivo += game.nazioni[id].vivo ? 1 : 0;
      a.provinceInizio += start[id];
      a.provinceFine += provincesOf(game, id).length;
      a.punteggio += score(game, id);
    }
  }
  return Object.entries(acc)
    .map(([id, a]) => ({
      id, nome: info[id].nome, difficolta: info[id].difficolta,
      vivo: a.vivo / semi, provinceInizio: a.provinceInizio / semi,
      provinceFine: a.provinceFine / semi, punteggio: a.punteggio / semi
    }))
    .sort((a, b) => b.punteggio - a.punteggio || a.id.localeCompare(b.id));
}

function table(rows, anni, semi, ms) {
  const lines = [`Bench regole: ${anni} anni, ${semi} semi, ${(ms / 1000).toFixed(1)} s`, ''];
  lines.push('popolo'.padEnd(16) + 'difficoltà'.padEnd(17) + 'vivo'.padStart(6) + 'prov. inizio'.padStart(14) + 'prov. fine'.padStart(12) + 'punteggio'.padStart(11));
  for (const r of rows) {
    lines.push(r.nome.padEnd(16) + r.difficolta.padEnd(17) + `${Math.round(r.vivo * 100)}%`.padStart(6) +
      r.provinceInizio.toFixed(1).padStart(14) + r.provinceFine.toFixed(1).padStart(12) + r.punteggio.toFixed(1).padStart(11));
  }
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const anni = Number(process.argv[2] ?? 100), semi = Number(process.argv[3] ?? 5);
  const t0 = performance.now();
  const rows = runBench({ anni, semi });
  const out = table(rows, anni, semi, performance.now() - t0);
  console.log(out);
  writeFileSync('bench-regole.txt', out + '\n');
}
