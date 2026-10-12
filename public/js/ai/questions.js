// Domande per Jev: il codice calcola i fatti e le opzioni legali, Jev sceglie, il codice interpreta.
import { legalWarTargets, enemiesOfNation, power } from './rules.js';
import { distancesFrom } from '../sim/armies.js';
import { armiesOf } from '../sim/state.js';
import { sideOf, enemiesOf, scoreFor, hasPretext, peaceCost } from '../sim/war.js';
import { formatDate } from '../sim/calendar.js';

const round2 = x => Math.round(x * 100) / 100;
const nome = (game, id) => game.nazioni[id]?.nome ?? id;

function statoPopolo(game, id, carattere) {
  const n = game.nazioni[id];
  return {
    data: formatDate(game.day),
    popolo: {
      nome: n.nome, carattere, governo: n.governo, stabilita: n.stabilita,
      infamia: Math.round(n.infamia), soglia_infamia: game.balance.infamia.soglia,
      tesoro: Math.round(n.tesoro), forza: Math.round(power(game, id))
    }
  };
}

function guerreDi(game, id) {
  return Object.values(game.guerre).filter(w => sideOf(w, id)).map(w => {
    const side = sideOf(w, id), nemici = enemiesOf(w, side);
    const prov = Object.values(game.province);
    return {
      contro: nemici.map(n => nome(game, n)).join(', '),
      punteggio: Math.round(scoreFor(game, w, id)),
      durata_anni: Math.round((game.day - w.inizio) / 36.5) / 10,
      nostre_province_occupate: prov.filter(p => p.owner === id && nemici.includes(p.controller)).length,
      loro_province_occupate_da_noi: prov.filter(p => nemici.includes(p.owner) && p.controller === id).length
    };
  });
}

// Obiettivi possibili per l'esercito principale, ciascuno con un significato diverso.
function objectiveOptions(game, id) {
  const armies = armiesOf(game, id);
  if (!armies.length) return {};
  const main = armies.reduce((a, b) => (b.fanteria + b.cavalleria > a.fanteria + a.cavalleria ? b : a));
  const { dist } = distancesFrom(game, id, main.prov);
  const enemies = enemiesOfNation(game, id);
  const n = game.nazioni[id];
  const P = pid => game.province[pid].nome;
  const byDist = (a, b) => dist[a.id] - dist[b.id] || (a.id < b.id ? -1 : 1);
  const raggiungibili = Object.values(game.province).filter(p => dist[p.id] !== undefined);
  const opts = {};
  opts.difendi = { prov: n.capitale, testo: `Difendere la capitale ${P(n.capitale)} e aspettare il nemico in casa.` };
  const perse = raggiungibili.filter(p => p.owner === id && enemies.includes(p.controller)).sort(byDist);
  if (perse.length) opts.libera = { prov: perse[0].id, testo: `Liberare ${P(perse[0].id)}, nostra provincia occupata da ${nome(game, perse[0].controller)}.` };
  const nemiche = raggiungibili.filter(p => enemies.includes(p.owner) && enemies.includes(p.controller)).sort(byDist);
  if (nemiche.length) {
    const v = nemiche[0];
    opts.vicina = { prov: v.id, testo: `Assediare ${P(v.id)} di ${nome(game, v.owner)}, la provincia nemica più vicina (${dist[v.id]} giorni di marcia).` };
    const r = [...nemiche].sort((a, b) => b.tasse - a.tasse || byDist(a, b))[0];
    if (r.id !== v.id) opts.ricca = { prov: r.id, testo: `Assediare ${P(r.id)}, la provincia nemica più ricca (tasse ${r.tasse}, ${dist[r.id]} giorni di marcia).` };
    const cap = nemiche.find(p => enemies.some(e => game.nazioni[e].capitale === p.id));
    if (cap && cap.id !== v.id && cap.id !== r.id) {
      opts.capitale = { prov: cap.id, testo: `Marciare sulla capitale nemica ${P(cap.id)} (${dist[cap.id]} giorni): se cade, la guerra è quasi vinta.` };
    }
  }
  return opts;
}

export function buildReview(game, id, carattere) {
  const inWar = Object.values(game.guerre).some(w => sideOf(w, id));
  const state = statoPopolo(game, id, carattere);
  const questions = {}, meta = {};
  if (!inWar) {
    const legal = legalWarTargets(game, id);
    if (!legal.length) return null;
    state.vicini_attaccabili = legal.map(c => ({
      nome: nome(game, c.id), rapporto_forze: round2(c.rapporto), pretesto: hasPretext(game, id, c.id)
    }));
    const criteria = { 'nessuna guerra': 'Restare in pace per ora: nessun vicino vale il rischio di una guerra adesso.' };
    const mappa = { 'nessuna guerra': null };
    for (const c of legal) {
      const N = nome(game, c.id);
      criteria[N] = `Dichiarare guerra a ${N}: le nostre forze sono ${round2(c.rapporto)} volte le sue` +
        (hasPretext(game, id, c.id) ? ', e abbiamo un pretesto.' : '; senza pretesto perdiamo stabilità.');
      mappa[N] = c.id;
    }
    questions.guerra = {
      type: 'choice',
      instructions: 'Sei il consiglio di `popolo.nome` e decidi secondo `popolo.carattere`. Guardando `vicini_attaccabili`, il rapporto di forze e la situazione interna, cosa fai adesso?',
      criteria
    };
    meta.guerra = { tipo: 'guerra', mappa, prudente: 'nessuna guerra' };
  } else {
    const opts = objectiveOptions(game, id);
    if (Object.keys(opts).length >= 2) {
      state.guerre = guerreDi(game, id);
      questions.obiettivo = {
        type: 'choice',
        instructions: 'Sei il consiglio di `popolo.nome` e decidi secondo `popolo.carattere`. Guardando `guerre`, dove mandi il grosso dell\'esercito nella prossima stagione?',
        criteria: Object.fromEntries(Object.entries(opts).map(([k, o]) => [k, o.testo]))
      };
      meta.obiettivo = { tipo: 'obiettivo', mappa: Object.fromEntries(Object.entries(opts).map(([k, o]) => [k, o.prov])), prudente: 'difendi' };
    }
  }
  return Object.keys(questions).length ? { state, questions, meta } : null;
}

export function buildPeaceQuestion(game, propId, carattere) {
  const p = game.proposte[propId], war = game.guerre[p.guerra], id = p.a;
  const state = statoPopolo(game, id, carattere);
  const cediamo = p.termini.ricevente !== id;
  const punteggio = Math.round(scoreFor(game, war, id));
  state.guerra = {
    contro: nome(game, p.da), punteggio,
    situazione: punteggio >= 10 ? 'la stiamo vincendo' : punteggio <= -10 ? 'la stiamo perdendo' : 'in equilibrio',
    durata_anni: Math.round((game.day - war.inizio) / 36.5) / 10
  };
  state.proposta = {
    da: nome(game, p.da),
    tipo: !p.termini.province.length ? 'pace bianca' : cediamo ? 'ci chiede province' : 'ci offre province',
    province: p.termini.province.map(pid => ({ nome: game.province[pid].nome, tasse: game.province[pid].tasse })),
    costo_in_punteggio: Math.round(peaceCost(game, war, p.termini.ricevente, p.termini))
  };
  return {
    state,
    questions: {
      // Una scelta con due significati chiari: come domanda sì/no Jev dava sempre un no tiepido, qualunque fossero i termini.
      pace: {
        type: 'choice',
        instructions: 'Sei il consiglio di `popolo.nome` e decidi secondo `popolo.carattere`. Guardando `guerra.situazione` e i termini di `proposta`, cosa rispondi?',
        criteria: {
          accetta: 'Accettare la pace: la guerra va male per noi, oppure i termini costano poco e conviene chiudere ora.',
          rifiuta: 'Rifiutare la pace: la guerra va bene per noi, oppure i termini sono troppo duri e conviene continuare a combattere.'
        }
      }
    },
    meta: { pace: { tipo: 'pace', proposta: propId, mappa: { accetta: true, rifiuta: false }, prudente: 'rifiuta' } }
  };
}

export function interpretChoice(answer, meta) {
  const probs = answer?.probabilities;
  if (!probs || typeof probs !== 'object') return null;
  const sorted = Object.entries(probs).filter(([, v]) => typeof v === 'number').sort((a, b) => b[1] - a[1]);
  if (!sorted.length || !Object.hasOwn(meta.mappa, sorted[0][0])) return null;
  const [top, p1] = sorted[0], p2 = sorted[1]?.[1] ?? 0;
  const incerto = p1 < 0.5 && p1 - p2 < 0.15;
  const scelta = incerto ? meta.prudente : top;
  return { scelta, valore: meta.mappa[scelta], incerto, probabilita: probs };
}
