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
import { buildControllers, syncControllers } from './public/js/ai/modes.js';
import { rulesController } from './public/js/ai/rules.js';
import { createAsk } from './jev-api.js';

// Obiettivi della tappa 6 (bench a regole, 100 anni, 20 semi): quota di popoli vivi per difficoltà e in totale.
// I "molto difficili" non hanno un minimo: devono restare duri anche per il giocatore (scelta dell'utente).
export const OBIETTIVI = { facile: [0.8, 1], normale: [0.5, 0.65], difficile: [0.3, 0.45], 'molto difficile': [0, 0.3], totale: [0.55, 1] };

// Ritocchi al bilanciamento per una sola corsa: { 'ia.rapportoGuerra': 2 }. Una chiave che non esiste è un errore.
export function applicaRitocchi(balance, ritocchi = {}) {
  const b = structuredClone(balance);
  for (const [chiave, valore] of Object.entries(ritocchi)) {
    const parti = chiave.split('.'), ultima = parti.pop();
    let o = b;
    for (const p of parti) {
      if (o[p] === null || typeof o[p] !== 'object') throw new Error(`ritocco sconosciuto: ${chiave}`);
      o = o[p];
    }
    // dentro difficolta le etichette sono oggetti spesso vuoti: lì una chiave nuova è legittima
    if (!(ultima in o) && parti[0] !== 'difficolta') throw new Error(`ritocco sconosciuto: ${chiave}`);
    o[ultima] = valore;
  }
  return b;
}

export async function runBench({ anni, semi, ia = 'regole', ask = null, registro = null, records = null, ritocchi = {}, primoSeme = 1 }) {
  const data = loadData();
  data.balance = applicaRitocchi(data.balance, ritocchi);
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
  const g6 = { guerre: 0, durate: [], dichiarate: { regole: 0, jev: 0 }, anniPopolo: { regole: 0, jev: 0 }, nati: 0, nuoviVivi: 0 };
  for (let seed = primoSeme; seed < primoSeme + semi; seed++) {
    semeCorrente = seed;
    const game = createGame({ ...data, seed });
    // ogni seme rigioca solo le sue decisioni (i registri vecchi, senza seme, valgono per il seme 1)
    const ai = records ? createReplayAi(records.filter(r => (r.seme ?? 1) === seed))
      : ia === 'regole' ? null
      : createJevAi({ ask, caratteri, onRecord });
    const modo = ai ? ia : 'regole';
    const controllers = buildControllers(game, modo, ai);
    const start = Object.fromEntries(game.ordine.map(id => [id, provincesOf(game, id).length]));
    const inizio = {};
    for (let d = 0; d < anni * 365; d++) {
      for (const e of advanceDay(game, controllers)) {
        if (e.tipo === 'guerra') {
          g6.guerre++;
          inizio[e.guerra] = game.day;
          g6.dichiarate[controllers[e.attaccante] === rulesController ? 'regole' : 'jev']++;
        } else if (e.tipo === 'pace' && inizio[e.guerra] !== undefined) {
          g6.durate.push((game.day - inizio[e.guerra]) / 365);
        } else if (e.tipo === 'nascita' || (e.tipo === 'indipendenza' && e.a.startsWith('liberi_'))) {
          g6.nati++; // risvegli e popoli nati da un'indipendenza
        }
      }
      if (game.day % 365 === 0) {
        for (const id of game.ordine) if (game.nazioni[id].vivo) g6.anniPopolo[controllers[id] === rulesController ? 'regole' : 'jev']++;
      }
      syncControllers(controllers, game, modo, ai); // popoli nati da un'indipendenza
      if (ai?.flush) await ai.flush();
    }
    g6.nuoviVivi += game.ordine.filter(id => start[id] === undefined && game.nazioni[id].vivo).length;
    for (const id of game.ordine) tipo[id] = controllers[id] === rulesController ? 'regole' : 'jev';
    for (const id of game.ordine) {
      const a = (acc[id] ??= { iniziale: start[id] !== undefined, nome: game.nazioni[id].nome, difficolta: info[id]?.difficolta ?? 'nuovo', vivo: 0, provinceInizio: 0, provinceFine: 0, punteggio: 0 });
      a.vivo += game.nazioni[id].vivo ? 1 : 0;
      a.provinceInizio += start[id] ?? 0;
      a.provinceFine += provincesOf(game, id).length;
      a.punteggio += score(game, id);
    }
  }
  const righe = Object.entries(acc)
    .map(([id, a]) => ({
      id, nome: a.nome, difficolta: a.difficolta, ia: tipo[id], iniziale: a.iniziale,
      vivo: a.vivo / semi, provinceInizio: a.provinceInizio / semi,
      provinceFine: a.provinceFine / semi, punteggio: a.punteggio / semi
    }))
    .sort((a, b) => b.punteggio - a.punteggio || (a.id < b.id ? -1 : 1));
  const originali = righe.filter(r => r.iniziale); // i 38 popoli di inizio partita: dormienti e nati dopo esclusi
  const media = list => list.length ? list.reduce((s, r) => s + r.vivo, 0) / list.length : null;
  const perDifficolta = Object.fromEntries(['facile', 'normale', 'difficile', 'molto difficile'].map(d => [d, media(originali.filter(r => r.difficolta === d))]));
  const roma = righe.find(r => r.id === 'roma');
  const perPA = k => (g6.anniPopolo[k] ? g6.dichiarate[k] / g6.anniPopolo[k] : null);
  const riepilogo = {
    perDifficolta, totale: media(originali),
    roma: { vivo: roma.vivo, provinceInizio: roma.provinceInizio, provinceFine: roma.provinceFine, punteggio: roma.punteggio },
    guerre: {
      perAnno: g6.guerre / (anni * semi),
      durataMediaAnni: g6.durate.length ? g6.durate.reduce((s, x) => s + x, 0) / g6.durate.length : 0,
      perPopoloAnno: { regole: perPA('regole'), jev: perPA('jev') }
    },
    nuovi: { nati: g6.nati / semi, vivi: g6.nuoviVivi / semi }
  };
  const dentro = (v, [lo, hi]) => v !== null && v >= lo && v <= hi;
  riepilogo.obiettivi = [
    { nome: 'facile', valore: perDifficolta.facile, atteso: OBIETTIVI.facile, ok: dentro(perDifficolta.facile, OBIETTIVI.facile) },
    { nome: 'Roma cresce', valore: roma.provinceFine, atteso: [roma.provinceInizio, Infinity], ok: roma.provinceFine > roma.provinceInizio },
    ...['normale', 'difficile', 'molto difficile'].map(d => ({ nome: d, valore: perDifficolta[d], atteso: OBIETTIVI[d], ok: dentro(perDifficolta[d], OBIETTIVI[d]) })),
    { nome: 'totale', valore: riepilogo.totale, atteso: OBIETTIVI.totale, ok: dentro(riepilogo.totale, OBIETTIVI.totale) }
  ];
  return { righe, totali, riepilogo };
}

function table(res, anni, semi, ia, ms) {
  const { righe, totali } = res;
  const lines = [`Bench ${ia}: ${anni} anni, ${semi} semi, ${(ms / 1000).toFixed(1)} s`];
  if (ia !== 'regole') {
    lines.push(`Richieste a Jev: ${totali.richieste}, token in ingresso: ${totali.tokenInput}, ` +
      `costo stimato: ${(totali.tokenInput * 0.042 / 1e6).toFixed(3)} $ (a 0,042 $ per milione)`);
    lines.push(`Decisioni: jev ${totali.fonti.jev}, prudenza ${totali.fonti.prudenza}, regola ${totali.fonti.regola}, superate ${totali.fonti.superata}`);
  }
  lines.push('');
  lines.push('popolo'.padEnd(16) + 'ia'.padEnd(8) + 'difficoltà'.padEnd(17) + 'vivo'.padStart(6) + 'prov. inizio'.padStart(14) + 'prov. fine'.padStart(12) + 'punteggio'.padStart(11));
  for (const r of righe) {
    lines.push(r.nome.slice(0, 15).padEnd(16) + r.ia.padEnd(8) + r.difficolta.padEnd(17) + `${Math.round(r.vivo * 100)}%`.padStart(6) +
      r.provinceInizio.toFixed(1).padStart(14) + r.provinceFine.toFixed(1).padStart(12) + r.punteggio.toFixed(1).padStart(11));
  }
  const p = v => (v === null ? '—' : `${Math.round(v * 100)}%`);
  const r = res.riepilogo;
  lines.push('', 'Obiettivi:');
  for (const o of r.obiettivi) lines.push(`  ${o.ok ? '✓' : '✗'} ${o.nome.padEnd(16)} ${o.nome === 'Roma cresce' ? `${o.valore.toFixed(1)} province` : p(o.valore)}` +
    (o.nome === 'Roma cresce' ? '' : `  (atteso ${p(o.atteso[0])}–${p(o.atteso[1])})`));
  lines.push(`Roma: viva ${p(r.roma.vivo)}, province ${r.roma.provinceInizio.toFixed(1)} → ${r.roma.provinceFine.toFixed(1)}, punteggio ${r.roma.punteggio.toFixed(1)}`);
  lines.push(`Guerre: ${r.guerre.perAnno.toFixed(2)} l'anno, durata media ${r.guerre.durataMediaAnni.toFixed(1)} anni, per popolo-anno regole ${r.guerre.perPopoloAnno.regole?.toFixed(3) ?? '—'} · Jev ${r.guerre.perPopoloAnno.jev?.toFixed(3) ?? '—'}`);
  lines.push(`Popoli nuovi: ${r.nuovi.nati.toFixed(1)} nati per partita, ${r.nuovi.vivi.toFixed(1)} vivi alla fine`);
  return lines.join('\n');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // opzioni: --set chiave=valore (ripetibile, valore JSON) e --da N (primo seme)
  const args = [], ritocchi = {};
  let primoSeme = 1;
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--set') {
      const [k, v] = process.argv[++i].split('=');
      ritocchi[k] = JSON.parse(v);
    } else if (a === '--da') primoSeme = Number(process.argv[++i]);
    else args.push(a);
  }
  const anni = Number(args[0] ?? 100), semi = Number(args[1] ?? 5);
  const modo = args[2] ?? 'regole', file = args[3] ?? null;
  const opts = { anni, semi, ia: modo, ritocchi, primoSeme };
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
  if (!Object.keys(ritocchi).length && primoSeme === 1) writeFileSync(`bench-${modo}.txt`, out + '\n'); // le varianti non sovrascrivono il risultato di riferimento
}
