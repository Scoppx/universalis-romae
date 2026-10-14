// Modelli dei pannelli: dallo stato di gioco ai dati pronti da mostrare. Niente DOM.
import { formatDate } from '../sim/calendar.js';
import { maxManpower, armiesOf, bordersNation, governmentOf, sliderOf } from '../sim/state.js';
import { checkSlider } from '../sim/government.js';
import { malcontent, hasColony, colonyCost, checkColony, fortCost, checkFortify } from '../sim/culture.js';
import { eventDef, describeEffects } from '../sim/events.js';
import { monthlyIncome, monthlyUpkeep, stabilityCost } from '../sim/economy.js';
import { atWar, inTruce, hasPretext, sideOf, enemiesOf, scoreFor, peaceCost, checkWar, maxCedibili } from '../sim/war.js';
import { relation, coalition, checkProposal, checkEmbassy, allied, checkLeaveFoedus } from '../sim/diplomacy.js';
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
const LEVE = [
  { quale: 'societa', nome: 'Società', sinistra: 'patrizi', destra: 'plebe' },
  { quale: 'guerra', nome: 'Dottrina', sinistra: 'difesa', destra: 'attacco' },
  { quale: 'governo', nome: 'Province', sinistra: 'accentramento', destra: 'autonomia' }
];
const GOVERNO = {
  tasse: v => `tasse ${v > 0 ? '+' : ''}${pct(v)}%`,
  reclute: v => `reclute ${v > 0 ? '+' : ''}${pct(v)}%`,
  equilibrioStabilita: v => `la stabilità tende a ${segno(v)}`,
  intervalloSlider: v => `riforme ogni ${v} anni`,
  foedusRapporto: v => `foedus con forza ${v} volte`
};
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

function formatBonus(d) {
  if (!d) return '';
  const parti = [];
  const pc = (k, v) => `${k} ${v > 1 ? '+' : ''}${Math.round((v - 1) * 100)}%`;
  if (d.esercito !== undefined && d.esercito !== 1) parti.push(pc('esercito', d.esercito));
  if (d.tesoro !== undefined && d.tesoro !== 1) parti.push(`tesoro ×${d.tesoro}`);
  if (d.uomini !== undefined && d.uomini !== 1) parti.push(pc('riserva', d.uomini));
  if (d.dado) parti.push(`${d.dado > 0 ? '+' : ''}${d.dado} al dado`);
  if (d.reclute) parti.push(`reclute ${d.reclute > 0 ? '+' : ''}${Math.round(d.reclute * 100)}%`);
  if (d.tasse) parti.push(`tasse ${d.tasse > 0 ? '+' : ''}${Math.round(d.tasse * 100)}%`);
  return parti.join(', ');
}

export function peopleCards(popoli, balance = null) {
  return popoli.popoli.filter(p => !p.dormiente)
    .map(p => ({
      id: p.id, nome: p.nome, colore: p.colore, difficolta: p.difficolta, governo: p.governo,
      capitale: p.capitale, tratti: formatTratti(p.tratti), carattere: p.carattere,
      bonus: formatBonus(balance?.difficolta?.[p.difficolta])
    }))
    .sort((a, b) => DIFFICOLTA.indexOf(a.difficolta) - DIFFICOLTA.indexOf(b.difficolta) || byNome(a, b));
}

const GOVERNI_ART = { 'tribù': 'una tribù', monarchia: 'una monarchia', repubblica: 'una repubblica', lega: 'una lega', 'città-stato': 'una città-stato' };

export function pendingEvents(game, g) {
  return Object.values(game.eventi).filter(e => e.nazione === g).map(e => {
    const def = eventDef(game, e.evento);
    return def && {
      id: e.id, titolo: def.titolo, testo: def.testo,
      opzioni: def.opzioni.map(o => ({ id: o.id, testo: o.testo, effetti: describeEffects(game, e, o) }))
    };
  }).filter(Boolean);
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
    puoReclutare: Boolean(g) && p.owner === g && p.controller === g,
    malcontento: malcontent(game, id),
    assimilazione: p.cultura !== game.nazioni[p.owner].cultura ? Math.floor(p.assimilazione) : null,
    colonia: hasColony(p),
    azioni: g && p.owner === g ? {
      colonia: { costo: colonyCost(game, id), uomini: game.balance.cultura.coloniaUomini, motivo: checkColony(game, g, id) },
      fortifica: { costo: fortCost(game, id), motivo: checkFortify(game, g, id) }
    } : null
  };
}

export function governmentView(game, g) {
  const n = game.nazioni[g], costo = stabilityCost(game, g), s = sliderOf(game, g);
  return {
    nome: n.nome, governo: n.governo,
    effettiGoverno: Object.entries(governmentOf(game, g)).map(([k, v]) => (GOVERNO[k] ? GOVERNO[k](v) : `${k} ${v}`)).join(', '),
    stabilita: segno(n.stabilita), tratti: formatTratti(n.tratti),
    costoStabilita: costo.toFixed(1), puoAlzare: n.stabilita < 3 && n.tesoro >= costo,
    slider: LEVE.map(l => ({ ...l, valore: segno(s[l.quale]), meno: checkSlider(game, g, l.quale, -1), piu: checkSlider(game, g, l.quale, 1) }))
  };
}

export function diplomacyView(game, g) {
  const me = game.nazioni[g];
  const ostili = coalition(game, g);
  return game.ordine
    .filter(id => id !== g && game.nazioni[id].vivo)
    .map(id => {
      const altro = game.nazioni[id];
      // la tregua per ultima: un alleato o un protettore in tregua resta tale (si può rompere o uscirne)
      const stato = atWar(game, g, id) ? 'guerra' : allied(game, g, id) ? 'alleato'
        : altro.protettore === g ? 'federato' : me.protettore === id ? 'protettore' : inTruce(game, g, id) ? 'tregua' : 'pace';
      const province = Object.values(game.province)
        .filter(p => !checkProposal(game, g, 'ultimatum', id, { provincia: p.id }))
        .map(p => ({ id: p.id, nome: p.nome }));
      return {
        id, nome: nome(game, id), relazione: relation(game, g, id), confina: bordersNation(game, g, id), stato,
        coalizione: ostili.includes(id),
        costoGuerra: hasPretext(game, g, id) ? 0 : game.balance.guerra.senzaPretesto,
        azioni: {
          ambasceria: checkEmbassy(game, g, id),
          alleanza: checkProposal(game, g, 'alleanza', id),
          rompi: allied(game, g, id) ? null : 'non siete alleati',
          esci: me.protettore === id ? checkLeaveFoedus(game, g) : 'non è il tuo protettore',
          foedus: checkProposal(game, g, 'foedus', id),
          tributo: checkProposal(game, g, 'tributo', id),
          guerra: checkWar(game, g, id),
          ultimatum: { motivo: province.length ? null : 'nessuna provincia da chiedere', province }
        }
      };
    })
    .sort((a, b) => Number(b.confina) - Number(a.confina) || byNome(a, b));
}

export function warsView(game, g) {
  const prov = Object.values(game.province);
  return Object.values(game.guerre).filter(w => sideOf(w, g)).map(w => {
    const side = sideOf(w, g), nemici = enemiesOf(w, side), mine = w[side];
    const costo = (ricevente, id) => Math.round(peaceCost(game, w, ricevente, { province: [id] }));
    return {
      id: w.id,
      nemico: { id: nemici[0], nome: nome(game, nemici[0]) },
      maxChiedibili: maxCedibili(game, nemici[0]),
      ruolo: side === 'attaccanti' ? 'attaccante' : 'difensore',
      capofila: w[side][0] === g,
      punteggio: Math.round(scoreFor(game, w, g)),
      daChiedere: prov.filter(p => nemici.includes(p.owner) && mine.includes(p.controller))
        .map(p => ({ id: p.id, nome: p.nome, costo: costo(g, p.id) })),
      daCedere: prov.filter(p => mine.includes(p.owner) && nemici.includes(p.controller))
        .map(p => ({ id: p.id, nome: p.nome, costo: costo(nemici[0], p.id) })),
      propostaInAttesa: Object.values(game.proposte).some(p => p.guerra === w.id && p.da === g)
    };
  });
}

export function armiesView(game, g, scelti = []) {
  return armiesOf(game, g).map(a => ({
    id: a.id, provincia: game.province[a.prov].nome, fanteria: a.fanteria, cavalleria: a.cavalleria,
    morale: a.morale.toFixed(1),
    destinazione: a.percorso.length ? game.province[a.percorso[a.percorso.length - 1]].nome : null,
    inBattaglia: a.inBattaglia, scelto: scelti.includes(a.id)
  }));
}

const TITOLI = { pace: 'Proposta di pace', alleanza: 'Alleanza', foedus: 'Foedus', tributo: 'Tributo', ultimatum: 'Ultimatum', chiamata: 'Chiamata alle armi' };

export function pendingProposals(game, g) {
  return Object.values(game.proposte).filter(p => p.a === g).map(p => {
    const da = nome(game, p.da);
    let testo;
    if (p.tipo === 'pace') {
      const nomi = p.termini.province.map(id => game.province[id].nome).join(', ');
      if (!p.termini.province.length) testo = `${da} propone una pace bianca.`;
      else if (p.termini.ricevente === g) testo = `${da} offre la pace e ti cede: ${nomi}.`;
      else testo = `${da} chiede la pace e vuole: ${nomi}.`;
    } else if (p.tipo === 'alleanza') testo = `${da} propone un'alleanza.`;
    else if (p.tipo === 'foedus') testo = `${da} ti offre un foedus: protezione in cambio di obbedienza e di uomini. Attenzione: non potrai più dichiarare guerre né allearti, e uscirne costerà stabilità e darà al protettore un pretesto di guerra.`;
    else if (p.tipo === 'tributo') testo = `${da} chiede un tributo: il 20% delle entrate per 10 anni. Se rifiuti avrà un pretesto per attaccarti.`;
    else if (p.tipo === 'ultimatum') testo = `${da} chiede la provincia di ${game.province[p.provincia].nome}. Se rifiuti avrà un pretesto per attaccarti.`;
    else {
      const w = game.guerre[p.guerra];
      const contro = w ? enemiesOf(w, sideOf(w, p.da)).map(n => nome(game, n)).join(', ') : '';
      testo = `${da} ti chiama alle armi contro ${contro}. Se rifiuti l'alleanza si rompe.`;
    }
    return { id: p.id, da, titolo: TITOLI[p.tipo], testo };
  });
}

// Notizie: guerre, paci, eliminazioni, indipendenze, nascite, governi ed eventi storici per tutti; battaglie, assedi, rifiuti, rivolte e assimilazioni solo se riguardano il giocatore.
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
    case 'accordo':
      return e.genere === 'ultimatum'
        ? `${N(e.a)} cede ${P(e.provincia)} a ${N(e.da)}.`
        : `${N(e.da)} e ${N(e.a)}: ${e.genere === 'alleanza' ? 'alleanza' : e.genere === 'foedus' ? 'foedus' : 'tributo'}.`;
    case 'chiamata': return `${N(e.nazione)} entra in guerra al fianco di ${N(e.alleato)}.`;
    case 'uscita': return `${N(e.nazione)} esce dal foedus di ${N(e.protettore)}.`;
    case 'battaglia':
      return [e.vincitore, e.sconfitto].includes(g) ? `Battaglia a ${P(e.prov)}: vince ${N(e.vincitore)}.` : null;
    case 'assedio':
      return e.nazione === g || game.province[e.prov]?.owner === g ? `${N(e.nazione)} conquista ${P(e.prov)}.` : null;
    case 'nascita': return `Nasce ${N(e.nazione)} a ${P(e.prov)}.`;
    case 'governo': return `${N(e.nazione)} diventa ${GOVERNI_ART[e.governo] ?? e.governo}.`;
    case 'evento': return e.storico && e.nazione !== g ? `${N(e.nazione)}: ${eventDef(game, e.evento)?.titolo ?? e.evento}.` : null;
    case 'rivolta': return e.nazione === g ? `Rivolta a ${P(e.prov)} contro ${N(e.nazione)}!` : null;
    case 'indipendenza': return `${P(e.prov)} si stacca da ${N(e.da)} e passa a ${N(e.a)}.`;
    case 'assimilata': return e.nazione === g ? `${P(e.prov)} ha preso la tua cultura.` : null;
    case 'rifiutata': return e.da === g ? `${N(e.a)} rifiuta la tua proposta di pace.` : null;
    default: return null;
  }
}

export function rankingView(game, g) {
  return ranking(game).map((r, i) => ({ pos: i + 1, nome: nome(game, r.id), punteggio: r.punteggio, vivo: r.vivo, tu: r.id === g }));
}

const DOMANDE = {
  guerra: 'Guerra?', obiettivo: 'Obiettivo degli eserciti', pace: 'Accettare la pace?',
  alleanza: 'Accettare l\'alleanza?', foedus: 'Accettare il foedus?', tributo: 'Pagare il tributo?',
  ultimatum: 'Cedere la provincia?', chiamata: 'Rispondere alla chiamata?', riforma: 'Quale riforma?', evento: 'Evento'
};

export function councilView(records, game, filtro) {
  return records.filter(r => !filtro || r.nazione === filtro).slice(-50).reverse().flatMap(r => r.domande.map(d => ({
    nazione: nome(game, r.nazione),
    data: formatDate(r.applicato),
    domanda: DOMANDE[d.domanda] ?? d.domanda,
    scelta: d.scelta, fonte: d.fonte,
    opzioni: d.probabilita === null ? []
      : typeof d.probabilita === 'number'
        ? [{ nome: 'sì', p: Math.round(d.probabilita * 100) }, { nome: 'no', p: Math.round((1 - d.probabilita) * 100) }]
        : Object.entries(d.probabilita).sort((a, b) => b[1] - a[1]).map(([k, p]) => ({ nome: k, p: Math.round(p * 100) }))
  })));
}

export function selectionActions(game, g, ids) {
  const armies = ids.map(id => game.eserciti[id]).filter(a => a && a.owner === g);
  const fermi = armies.every(a => !a.percorso.length && !a.inBattaglia);
  const min = game.balance.combattimento.minimoUomini;
  const uno = armies.length === 1 ? armies[0] : null;
  return {
    puoUnire: armies.length >= 2 && armies.length === ids.length && fermi && armies.every(a => a.prov === armies[0].prov),
    puoDividere: Boolean(uno) && !uno.inBattaglia &&
      Math.floor(uno.fanteria / 2) + Math.floor(uno.cavalleria / 2) >= min &&
      Math.ceil(uno.fanteria / 2) + Math.ceil(uno.cavalleria / 2) >= min
  };
}
