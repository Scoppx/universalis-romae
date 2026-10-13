// Domande per Jev: il codice calcola i fatti e le opzioni legali, Jev sceglie, il codice interpreta.
import { legalWarTargets, enemiesOfNation, power } from './rules.js';
import { distancesFrom } from '../sim/armies.js';
import { armiesOf, sliderOf, provincesOf } from '../sim/state.js';
import { checkSlider, sliderInterval } from '../sim/government.js';
import { malcontent } from '../sim/culture.js';
import { eventDef, describeEffects } from '../sim/events.js';
import { sideOf, enemiesOf, scoreFor, hasPretext, peaceCost } from '../sim/war.js';
import { formatDate } from '../sim/calendar.js';
import { relation } from '../sim/diplomacy.js';

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

const PROPOSTE = {
  alleanza: ['un\'alleanza', 'Allearsi: ci difenderemo a vicenda e potremo chiamarci in guerra.', 'Restare liberi da impegni.'],
  foedus: ['un foedus', 'Entrare nel foedus: protezione di un popolo più forte, ma niente guerre nostre e uomini ceduti ogni mese.', 'Restare indipendenti.'],
  tributo: ['un tributo', 'Pagare il tributo (il 20% delle entrate per 10 anni) per non dargli un pretesto di guerra.', 'Rifiutare il tributo: avrà un pretesto per attaccarci.'],
  ultimatum: ['una provincia', 'Cedere la provincia per evitare la guerra.', 'Rifiutare e prepararsi alla guerra: avrà un pretesto per attaccarci.'],
  chiamata: ['di entrare in guerra al suo fianco', 'Rispondere alla chiamata ed entrare in guerra con l\'alleato.', 'Restare fuori dalla guerra: l\'alleanza si rompe.']
};

export function buildProposalQuestion(game, propId, carattere) {
  const p = game.proposte[propId];
  if (p.tipo === 'pace') return buildPeaceQuestion(game, propId, carattere);
  const id = p.a, [cosa, si, no] = PROPOSTE[p.tipo];
  const state = statoPopolo(game, id, carattere);
  const w = p.tipo === 'chiamata' ? game.guerre[p.guerra] : null;
  state.proposta = {
    da: nome(game, p.da), chiede: cosa,
    relazione: relation(game, id, p.da),
    rapporto_forze: round2(power(game, p.da) / Math.max(1, power(game, id))),
    ...(p.tipo === 'ultimatum' ? { provincia: game.province[p.provincia].nome } : {}),
    ...(w ? { contro: enemiesOf(w, sideOf(w, p.da)).map(n => nome(game, n)).join(', ') } : {})
  };
  return {
    state,
    questions: {
      [p.tipo]: {
        type: 'choice',
        instructions: 'Sei il consiglio di `popolo.nome` e decidi secondo `popolo.carattere`. Guardando `proposta`, la relazione e il rapporto di forze, cosa rispondi?',
        criteria: { accetta: si, rifiuta: no }
      }
    },
    meta: { [p.tipo]: { tipo: 'proposta', genere: p.tipo, proposta: propId, mappa: { accetta: true, rifiuta: false }, prudente: 'rifiuta' } }
  };
}

const LEVE = [
  ['societa', -1, 'patrizi', 'Dare più potere ai patrizi: +2% di tasse per ogni passo.'],
  ['societa', 1, 'plebe', 'Dare più spazio alla plebe: +3% di reclute per ogni passo.'],
  ['guerra', -1, 'difesa', 'Educare il popolo alla difesa: oltre −4, +1 al dado quando si combatte in casa.'],
  ['guerra', 1, 'attacco', 'Educare il popolo all\'attacco: oltre +4, +1 al dado quando si combatte in terra nemica.'],
  ['governo', -1, 'accentramento', 'Accentrare il potere: le province straniere si assimilano prima, ma il malcontento cresce.'],
  ['governo', 1, 'autonomia', 'Lasciare autonomia alle province: meno malcontento, ma assimilazione più lenta.']
];

export function buildSliderQuestion(game, id, carattere) {
  const criteria = { nessuna: 'Non fare riforme per ora: la situazione va bene così.' };
  const mappa = { nessuna: null };
  for (const [quale, verso, k, testo] of LEVE) {
    if (checkSlider(game, id, quale, verso)) continue;
    criteria[k] = testo;
    mappa[k] = { quale, verso };
  }
  if (Object.keys(mappa).length === 1) return null;
  const n = game.nazioni[id], s = sliderOf(game, id), prov = provincesOf(game, id);
  const state = statoPopolo(game, id, carattere);
  state.riforme = {
    societa: s.societa, guerra: s.guerra, governo: s.governo,
    nota: `Ogni leva va da −5 (patrizi, difesa, accentramento) a +5 (plebe, attacco, autonomia); la prossima riforma tra ${sliderInterval(game, id) / 365} anni.`
  };
  state.province = {
    totali: prov.length,
    di_altra_cultura: prov.filter(p => p.cultura !== n.cultura).length,
    scontente: prov.filter(p => malcontent(game, p.id) > game.balance.cultura.sogliaRivolta).length
  };
  state.in_guerra = enemiesOfNation(game, id).length > 0;
  return {
    state,
    questions: {
      riforma: {
        type: 'choice',
        instructions: 'Sei il consiglio di `popolo.nome` e decidi secondo `popolo.carattere`. Guardando `riforme`, `province` e la situazione, quale riforma fai adesso?',
        criteria
      }
    },
    meta: { riforma: { tipo: 'slider', mappa, prudente: 'nessuna' } }
  };
}

// Numero in [0, 1) da una chiave intera (un passo di mulberry32): non tocca il generatore della partita.
function hashUnit(n) {
  let t = (n + 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// Scelte di gusto: si estrae dalle probabilità (temperatura 0,8) invece di prendere sempre la più probabile.
export function sampleChoice(answer, meta, chiave, temperatura = 0.8) {
  const probs = answer?.probabilities;
  if (!probs || typeof probs !== 'object') return null;
  const voci = Object.entries(probs)
    .filter(([k, v]) => typeof v === 'number' && v > 0 && Object.hasOwn(meta.mappa, k))
    .sort(([a], [b]) => (a < b ? -1 : 1));
  if (!voci.length) return null;
  const pesi = voci.map(([, v]) => v ** (1 / temperatura));
  let u = hashUnit(chiave) * pesi.reduce((s, x) => s + x, 0);
  let i = 0;
  while (i < voci.length - 1 && (u -= pesi[i]) >= 0) i++;
  const scelta = voci[i][0];
  return { scelta, valore: meta.mappa[scelta], incerto: false, probabilita: probs };
}

export function buildEventQuestion(game, pid, carattere) {
  const e = game.eventi[pid], def = eventDef(game, e.evento);
  const state = statoPopolo(game, e.nazione, carattere);
  state.evento = { titolo: def.titolo, testo: def.testo, ...(e.altro ? { altro: nome(game, e.altro) } : {}) };
  return {
    state,
    questions: {
      evento: {
        type: 'choice',
        instructions: 'Sei il consiglio di `popolo.nome` e decidi secondo `popolo.carattere`. Davanti a `evento`, quale strada scegli?',
        criteria: Object.fromEntries(def.opzioni.map(o => [o.id, `${o.testo} (${describeEffects(game, e, o)})`]))
      }
    },
    meta: { evento: { tipo: 'evento', evento: pid, mappa: Object.fromEntries(def.opzioni.map(o => [o.id, o.id])), prudente: def.regola } }
  };
}
