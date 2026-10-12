// Modelli dei pannelli: dallo stato di gioco ai dati pronti da mostrare. Niente DOM.
import { formatDate } from '../sim/calendar.js';
import { maxManpower, armiesOf, bordersNation } from '../sim/state.js';
import { monthlyIncome, monthlyUpkeep, stabilityCost } from '../sim/economy.js';
import { atWar, inTruce, hasPretext, sideOf, enemiesOf, scoreFor, peaceCost } from '../sim/war.js';
import { ranking } from '../sim/score.js';

const DIFFICOLTA = ['facile', 'normale', 'difficile', 'molto difficile'];
const pct = v => Math.round(v * 100);
const TRATTI = {
  reclute: v => `reclute +${pct(v)}%`,
  stabilita: v => `stabilità +${pct(v)}%`,
  assimilazione: v => `assimilazione +${pct(v)}%`,
  battaglia: v => `battaglia +${v}`,
  montagna: v => `montagna +${v}`,
  assedio: v => `assedio ${v > 0 ? '+' : ''}${pct(v)}%`
};
const segno = n => (n > 0 ? `+${n}` : `${n}`);
const byNome = (a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0);
const nome = (game, id) => game.nazioni[id]?.nome ?? id;

export function formatTratti(tratti) {
  return Object.entries(tratti).map(([k, v]) => (TRATTI[k] ? TRATTI[k](v) : `${k} ${v}`)).join(', ');
}

export function topBar(game, g) {
  const n = game.nazioni[g];
  const netto = monthlyIncome(game, g) - monthlyUpkeep(game, g);
  return {
    data: formatDate(game.day),
    tesoro: n.tesoro.toFixed(1),
    entrate: `${netto >= 0 ? '+' : ''}${netto.toFixed(2)}/mese`,
    uomini: `${n.uomini}/${maxManpower(game, g)}`,
    stabilita: segno(n.stabilita),
    infamia: `${n.infamia.toFixed(1)}/${game.balance.infamia.soglia}`
  };
}

export function peopleCards(popoli) {
  return popoli.popoli.filter(p => !p.dormiente)
    .map(p => ({
      id: p.id, nome: p.nome, colore: p.colore, difficolta: p.difficolta, governo: p.governo,
      capitale: p.capitale, tratti: formatTratti(p.tratti), carattere: p.carattere
    }))
    .sort((a, b) => DIFFICOLTA.indexOf(a.difficolta) - DIFFICOLTA.indexOf(b.difficolta) || byNome(a, b));
}

export function provinceInfo(game, id, g) {
  const p = game.province[id];
  return {
    id, nome: p.nome,
    proprietario: { id: p.owner, nome: nome(game, p.owner) },
    occupante: p.controller !== p.owner ? { id: p.controller, nome: nome(game, p.controller) } : null,
    cultura: p.cultura, terreno: p.terreno, tasse: p.tasse, uomini: p.uomini, fort: p.fort,
    eserciti: Object.values(game.eserciti).filter(a => a.prov === id).map(a => ({
      id: a.id, nazione: nome(game, a.owner), mio: a.owner === g,
      uomini: a.fanteria + a.cavalleria, morale: a.morale.toFixed(1)
    })),
    puoReclutare: Boolean(g) && p.owner === g && p.controller === g
  };
}

export function governmentView(game, g) {
  const n = game.nazioni[g], costo = stabilityCost(game, g);
  return {
    nome: n.nome, governo: n.governo, stabilita: segno(n.stabilita), tratti: formatTratti(n.tratti),
    costoStabilita: costo.toFixed(1), puoAlzare: n.stabilita < 3 && n.tesoro >= costo
  };
}

export function diplomacyView(game, g) {
  return game.ordine
    .filter(id => id !== g && game.nazioni[id].vivo && bordersNation(game, g, id))
    .map(id => {
      const guerra = atWar(game, g, id), tregua = !guerra && inTruce(game, g, id);
      const pretesto = hasPretext(game, g, id);
      return {
        id, nome: nome(game, id), stato: guerra ? 'guerra' : tregua ? 'tregua' : 'pace',
        finoA: tregua ? formatDate(game.nazioni[g].tregue[id]) : null,
        pretesto, costo: pretesto ? 0 : game.balance.guerra.senzaPretesto,
        puoDichiarare: !guerra && !tregua
      };
    })
    .sort(byNome);
}

export function warsView(game, g) {
  const prov = Object.values(game.province);
  return Object.values(game.guerre).filter(w => sideOf(w, g)).map(w => {
    const side = sideOf(w, g), nemici = enemiesOf(w, side), mine = w[side];
    const costo = (ricevente, id) => Math.round(peaceCost(game, w, ricevente, { province: [id] }));
    return {
      id: w.id,
      nemico: { id: nemici[0], nome: nome(game, nemici[0]) },
      ruolo: side === 'attaccanti' ? 'attaccante' : 'difensore',
      punteggio: Math.round(scoreFor(game, w, g)),
      daChiedere: prov.filter(p => nemici.includes(p.owner) && mine.includes(p.controller))
        .map(p => ({ id: p.id, nome: p.nome, costo: costo(g, p.id) })),
      daCedere: prov.filter(p => mine.includes(p.owner) && nemici.includes(p.controller))
        .map(p => ({ id: p.id, nome: p.nome, costo: costo(nemici[0], p.id) })),
      propostaInAttesa: Object.values(game.proposte).some(p => p.guerra === w.id && p.da === g)
    };
  });
}

export function armiesView(game, g) {
  return armiesOf(game, g).map(a => ({
    id: a.id, provincia: game.province[a.prov].nome, fanteria: a.fanteria, cavalleria: a.cavalleria,
    morale: a.morale.toFixed(1),
    destinazione: a.percorso.length ? game.province[a.percorso[a.percorso.length - 1]].nome : null,
    inBattaglia: a.inBattaglia
  }));
}

export function pendingProposals(game, g) {
  return Object.values(game.proposte).filter(p => p.a === g).map(p => {
    const nomi = p.termini.province.map(id => game.province[id].nome).join(', ');
    let testo;
    if (!p.termini.province.length) testo = `${nome(game, p.da)} propone una pace bianca.`;
    else if (p.termini.ricevente === g) testo = `${nome(game, p.da)} offre la pace e ti cede: ${nomi}.`;
    else testo = `${nome(game, p.da)} chiede la pace e vuole: ${nomi}.`;
    return { id: p.id, da: nome(game, p.da), testo };
  });
}

// Notizie: guerre, paci ed eliminazioni per tutti; battaglie, assedi e rifiuti solo se riguardano il giocatore.
export function formatLogEntry(e, game, g) {
  const N = id => nome(game, id), P = id => game.province[id]?.nome ?? id;
  switch (e.tipo) {
    case 'guerra': return `${N(e.attaccante)} dichiara guerra a ${N(e.difensore)}.`;
    case 'pace': {
      const altri = e.parti.filter(x => x !== e.ricevente).map(N).join(', ');
      return e.province.length
        ? `Pace tra ${N(e.ricevente)} e ${altri}: ${N(e.ricevente)} ottiene ${e.province.map(P).join(', ')}.`
        : `Pace bianca tra ${N(e.ricevente)} e ${altri}.`;
    }
    case 'eliminata': return `${N(e.nazione)} scompare dalla storia.`;
    case 'battaglia':
      return [e.vincitore, e.sconfitto].includes(g) ? `Battaglia a ${P(e.prov)}: vince ${N(e.vincitore)}.` : null;
    case 'assedio':
      return e.nazione === g || game.province[e.prov]?.owner === g ? `${N(e.nazione)} conquista ${P(e.prov)}.` : null;
    case 'rifiutata': return e.da === g ? `${N(e.a)} rifiuta la tua proposta di pace.` : null;
    default: return null;
  }
}

export function rankingView(game, g) {
  return ranking(game).map((r, i) => ({ pos: i + 1, nome: nome(game, r.id), punteggio: r.punteggio, vivo: r.vivo, tu: r.id === g }));
}
