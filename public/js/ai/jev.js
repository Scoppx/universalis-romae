// IA con Jev: le decisioni strategiche si chiedono a Jev in modo asincrono e diventano comandi quando
// la risposta arriva. Il lavoro di fino resta alle regole. Se Jev non risponde, decidono le regole.
import { isReviewDay, peaceProposals, warDecision, answerProposals, routine, legalWarTargets, diplomacyInitiatives, isSliderDay, sliderDecision, colonyDecision } from './rules.js';
import { buildReview, buildProposalQuestion, interpretChoice, buildSliderQuestion, sampleChoice } from './questions.js';
import { sideOf } from '../sim/war.js';

const inGuerra = (game, id) => Object.values(game.guerre).some(w => sideOf(w, id));

export function createJevAi({ ask, caratteri, maxParallel = 4, scadenza = 60, maxCoda = 40, onRecord = () => {} }) {
  const coda = [];
  const inVolo = new Set();
  const pronte = [];
  const chieste = new Set();
  let seq = 0;

  function pump() {
    while (inVolo.size < maxParallel && coda.length) {
      const job = coda.shift();
      const p = Promise.resolve()
        .then(() => ask(job.req))
        .then(res => { pronte.push({ job, res }); }, err => { pronte.push({ job, err: String(err?.message || err) }); })
        .finally(() => { inVolo.delete(p); pump(); });
      inVolo.add(p);
    }
  }

  function enqueue(job) {
    job.seq = seq++;
    if (coda.length >= maxCoda) pronte.push({ job: coda.shift(), err: 'coda piena' });
    coda.push(job);
    pump();
  }

  // stato.guerra: il popolo è già in guerra, o lo sarà con i comandi già decisi oggi
  function applica(game, { job, res, err }, stato) {
    const id = job.nazione;
    const scaduta = game.day - job.giorno > scadenza;
    const usabile = !err && !scaduta && game.nazioni[id].vivo;
    const record = {
      seq: job.seq, giorno: job.giorno, applicato: game.day, nazione: id, domande: [], comandi: [],
      usage: res?.usage ?? null, errore: err ?? (scaduta ? 'risposta oltre i 60 giorni' : null)
    };
    for (const [q, meta] of Object.entries(job.meta)) {
      const ans = res?.answers?.[q];
      if (meta.tipo === 'pace' || meta.tipo === 'proposta') {
        const domanda = meta.genere ?? 'pace';
        if (!game.proposte[meta.proposta]) { record.domande.push({ domanda, scelta: null, fonte: 'superata', probabilita: null }); continue; }
        const v = usabile ? interpretChoice(ans, meta) : null;
        const accetta = v ? v.valore : answerProposals(game, id).find(c => c.proposta === meta.proposta).accetta;
        record.comandi.push({ tipo: 'rispondi', nazione: id, proposta: meta.proposta, accetta });
        record.domande.push({ domanda, scelta: accetta ? 'accetta' : 'rifiuta', fonte: v ? (v.incerto ? 'prudenza' : 'jev') : 'regola', probabilita: v ? v.probabilita : null });
        continue;
      }
      if (meta.tipo === 'slider') {
        // riforma: scelta di gusto, estratta dalle probabilità con una chiave fissa (il rigioco legge i comandi dal registro)
        const v = usabile ? sampleChoice(ans, meta, job.seq * 100003 + job.giorno) : null;
        record.comandi.push(...(v ? (v.valore ? [{ tipo: 'slider', nazione: id, ...v.valore }] : []) : sliderDecision(game, id)));
        record.domande.push({ domanda: 'riforma', scelta: v ? v.scelta : 'regola', fonte: v ? 'jev' : 'regola', probabilita: v ? v.probabilita : null });
        continue;
      }
      if (meta.tipo === 'guerra' && stato.guerra) {
        record.domande.push({ domanda: 'guerra', scelta: null, fonte: 'superata', probabilita: null });
        continue;
      }
      const v = usabile ? interpretChoice(ans, meta) : null;
      if (meta.tipo === 'guerra') {
        // la risposta può essere vecchia: il bersaglio deve essere ancora legale adesso
        if (v?.valore && !legalWarTargets(game, id).some(c => c.id === v.valore)) {
          record.domande.push({ domanda: 'guerra', scelta: v.scelta, fonte: 'superata', probabilita: v.probabilita });
          continue;
        }
        const dichiarazioni = v ? (v.valore ? [{ tipo: 'dichiara_guerra', nazione: id, contro: v.valore }] : []) : warDecision(game, id);
        if (dichiarazioni.length) stato.guerra = true;
        record.comandi.push(...dichiarazioni);
      } else if (meta.tipo === 'obiettivo') {
        // senza una risposta valida l'obiettivo vecchio non deve continuare a guidare gli eserciti
        record.comandi.push({ tipo: 'obiettivo', nazione: id, provincia: v ? v.valore : null });
      }
      record.domande.push({ domanda: meta.tipo, scelta: v ? v.scelta : 'regola', fonte: v ? (v.incerto ? 'prudenza' : 'jev') : 'regola', probabilita: v ? v.probabilita : null });
    }
    onRecord(record);
    return record.comandi;
  }

  function controller(game, id) {
    const cmds = [];
    const mie = pronte.filter(r => r.job.nazione === id).sort((a, b) => a.job.seq - b.job.seq);
    const stato = { guerra: inGuerra(game, id) };
    for (const r of mie) {
      pronte.splice(pronte.indexOf(r), 1);
      cmds.push(...applica(game, r, stato));
    }
    for (const p of Object.values(game.proposte)) {
      if (p.a !== id || chieste.has(p.id)) continue;
      chieste.add(p.id);
      const q = buildProposalQuestion(game, p.id, caratteri[id] ?? '');
      enqueue({ nazione: id, giorno: game.day, req: { state: q.state, questions: q.questions }, meta: q.meta });
    }
    if (isReviewDay(game, id)) {
      if (inGuerra(game, id)) cmds.push(...peaceProposals(game, id));
      else cmds.push(...diplomacyInitiatives(game, id));
      cmds.push(...colonyDecision(game, id));
      const q = buildReview(game, id, caratteri[id] ?? '');
      if (q) enqueue({ nazione: id, giorno: game.day, req: { state: q.state, questions: q.questions }, meta: q.meta });
    }
    if (isSliderDay(game, id)) {
      const q = buildSliderQuestion(game, id, caratteri[id] ?? '');
      if (q) enqueue({ nazione: id, giorno: game.day, req: { state: q.state, questions: q.questions }, meta: q.meta });
    }
    cmds.push(...routine(game, id));
    return cmds;
  }

  async function flush() {
    while (inVolo.size || coda.length) await Promise.all([...inVolo]);
  }

  return { controller, flush, inAttesa: () => coda.length + inVolo.size };
}

// Rigioca una partita dal registro: stessi comandi negli stessi giorni, stesso lavoro di fino.
export function createReplayAi(records) {
  const perGiorno = new Map();
  for (const r of [...records].sort((a, b) => a.seq - b.seq)) {
    const k = `${r.applicato}|${r.nazione}`;
    if (!perGiorno.has(k)) perGiorno.set(k, []);
    perGiorno.get(k).push(...r.comandi);
  }
  function controller(game, id) {
    const cmds = [...(perGiorno.get(`${game.day}|${id}`) ?? [])];
    if (isReviewDay(game, id)) cmds.push(...(inGuerra(game, id) ? peaceProposals(game, id) : diplomacyInitiatives(game, id)), ...colonyDecision(game, id));
    cmds.push(...routine(game, id));
    return cmds;
  }
  return { controller };
}
