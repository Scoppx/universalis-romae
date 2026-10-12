// Partite headless. Uso:
//   node bench.js [anni=100] [semi=5] [regole|jev|misto] [registro.jsonl]
//   node bench.js [anni] [semi] rigioca registro.jsonl
// Le modalità jev e misto chiamano TypeSafe e richiedono TYPESAFE_API_KEY.
import { writeFileSync, appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadData } from './tools/load-data.js';
import { createGame } from './public/js/sim/setup.js';
import { advanceDay } from './public/js/sim/loop.js';
import { provincesOf } from './public/js/sim/state.js';
import { score } from './public/js/sim/score.js';
import { createJevAi, createReplayAi } from './public/js/ai/jev.js';
import { buildControllers } from './public/js/ai/modes.js';
import { rulesController } from './public/js/ai/rules.js';
import { createAsk } from './jev-api.js';

export async function runBench({ anni, semi, ia = 'regole', ask = null, registro = null, records = null }) {
  const data = loadData();
  const info = Object.fromEntries(data.popoli.popoli.map(p => [p.id, p]));
  const caratteri = Object.fromEntries(data.popoli.popoli.map(p => [p.id, p.carattere]));
  const totali = { richieste: 0, tokenInput: 0, fonti: { jev: 0, prudenza: 0, regola: 0, superata: 0 } };
  let semeCorrente = 1;
  const onRecord = r => {
    totali.richieste++;
    totali.tokenInput += r.usage?.input_tokens ?? 0;
    for (const d of r.domande) totali.fonti[d.fonte]++;
    if (registro) registro({ ...r, seme: semeCorrente });
  };
  const acc = {};
  let tipo = {};
  for (let seed = 1; seed <= semi; seed++) {
    semeCorrente = seed;
    const game = createGame({ ...data, seed });
    // ogni seme rigioca solo le sue decisioni (i registri vecchi, senza seme, valgono per il seme 1)
    const ai = records ? createReplayAi(records.filter(r => (r.seme ?? 1) === seed))
      : ia === 'regole' ? null
      : createJevAi({ ask, caratteri, onRecord });
    const controllers = buildControllers(game, ia, ai);
    tipo = Object.fromEntries(game.ordine.map(id => [id, controllers[id] === rulesController ? 'regole' : 'jev']));
    const start = Object.fromEntries(game.ordine.map(id => [id, provincesOf(game, id).length]));
    for (let d = 0; d < anni * 365; d++) {
      advanceDay(game, controllers);
      if (ai?.flush) await ai.flush();
    }
    for (const id of game.ordine) {
      const a = (acc[id] ??= { vivo: 0, provinceInizio: 0, provinceFine: 0, punteggio: 0 });
      a.vivo += game.nazioni[id].vivo ? 1 : 0;
      a.provinceInizio += start[id];
      a.provinceFine += provincesOf(game, id).length;
      a.punteggio += score(game, id);
    }
  }
  const righe = Object.entries(acc)
    .map(([id, a]) => ({
      id, nome: info[id].nome, difficolta: info[id].difficolta, ia: tipo[id],
      vivo: a.vivo / semi, provinceInizio: a.provinceInizio / semi,
      provinceFine: a.provinceFine / semi, punteggio: a.punteggio / semi
    }))
    .sort((a, b) => b.punteggio - a.punteggio || (a.id < b.id ? -1 : 1));
  return { righe, totali };
}

function table({ righe, totali }, anni, semi, ia, ms) {
  const lines = [`Bench ${ia}: ${anni} anni, ${semi} semi, ${(ms / 1000).toFixed(1)} s`];
  if (ia !== 'regole') {
    lines.push(`Richieste a Jev: ${totali.richieste}, token in ingresso: ${totali.tokenInput}, ` +
      `costo stimato: ${(totali.tokenInput * 0.042 / 1e6).toFixed(3)} $ (a 0,042 $ per milione)`);
    lines.push(`Decisioni: jev ${totali.fonti.jev}, prudenza ${totali.fonti.prudenza}, regola ${totali.fonti.regola}, superate ${totali.fonti.superata}`);
  }
  lines.push('');
  lines.push('popolo'.padEnd(16) + 'ia'.padEnd(8) + 'difficoltà'.padEnd(17) + 'vivo'.padStart(6) + 'prov. inizio'.padStart(14) + 'prov. fine'.padStart(12) + 'punteggio'.padStart(11));
  for (const r of righe) {
    lines.push(r.nome.padEnd(16) + r.ia.padEnd(8) + r.difficolta.padEnd(17) + `${Math.round(r.vivo * 100)}%`.padStart(6) +
      r.provinceInizio.toFixed(1).padStart(14) + r.provinceFine.toFixed(1).padStart(12) + r.punteggio.toFixed(1).padStart(11));
  }
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const anni = Number(process.argv[2] ?? 100), semi = Number(process.argv[3] ?? 5);
  const modo = process.argv[4] ?? 'regole', file = process.argv[5] ?? null;
  const opts = { anni, semi, ia: modo };
  if (modo === 'rigioca') {
    opts.ia = 'misto';
    opts.records = readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l));
    const ias = new Set(opts.records.map(r => r.ia).filter(Boolean));
    if (ias.size === 1) opts.ia = [...ias][0];
  } else if (modo !== 'regole') {
    if (!process.env.TYPESAFE_API_KEY) { console.error('Serve TYPESAFE_API_KEY per le modalità jev e misto.'); process.exit(1); }
    opts.ask = createAsk({ key: process.env.TYPESAFE_API_KEY });
    if (file) {
      writeFileSync(file, '');
      opts.registro = r => appendFileSync(file, JSON.stringify({ ...r, ia: modo }) + '\n');
    }
  }
  const t0 = performance.now();
  const res = await runBench(opts);
  const out = table(res, anni, semi, opts.ia, performance.now() - t0);
  console.log(out);
  writeFileSync(`bench-${modo}.txt`, out + '\n');
}
