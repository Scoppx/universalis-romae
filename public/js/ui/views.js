// Modelli dei pannelli: dallo stato di gioco ai dati pronti da mostrare. Niente DOM.
import { formatDate, dateFromDay, MONTH_NAMES } from '../sim/calendar.js';
import { maxManpower, armiesOf, bordersNation, governmentOf, sliderOf, power, provincesOf } from '../sim/state.js';
import { checkSlider } from '../sim/government.js';
import { malcontent, hasColony, colonyCost, checkColony, fortCost, checkFortify } from '../sim/culture.js';
import { eventDef, describeEffects } from '../sim/events.js';
import { nearestSafe, checkRetreat } from '../sim/combat.js';
import { garrison, siegeInfo, assaultChance, checkAssault } from '../sim/siege.js';
import { monthlyIncome, monthlyUpkeep, stabilityCost } from '../sim/economy.js';
import { atWar, inTruce, hasPretext, sideOf, enemiesOf, scoreFor, peaceCost, checkWar, maxCedibili, validTerms, annexable } from '../sim/war.js';
import { relation, coalition, checkProposal, checkEmbassy, allied, checkLeaveFoedus, warPreview } from '../sim/diplomacy.js';
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
const POI = ' Poi la prossima riforma si potrà fare solo tra alcuni anni.';
const LEVE = [
  { quale: 'societa', nome: 'Società', sinistra: 'patrizi', destra: 'plebe',
    effettoMeno: 'Un passo verso i patrizi: +2% di tasse per ogni punto da quella parte.' + POI,
    effettoPiu: 'Un passo verso la plebe: +3% di reclute per ogni punto da quella parte.' + POI },
  { quale: 'guerra', nome: 'Dottrina', sinistra: 'difesa', destra: 'attacco',
    effettoMeno: 'Un passo verso la difesa: da −4 in giù, +1 al dado quando combatti in casa.' + POI,
    effettoPiu: 'Un passo verso l\'attacco: da +4 in su, +1 al dado quando combatti in terra nemica.' + POI },
  { quale: 'governo', nome: 'Province', sinistra: 'accentramento', destra: 'autonomia',
    effettoMeno: 'Un passo verso l\'accentramento: le province straniere si assimilano prima, ma il malcontento cresce.' + POI,
    effettoPiu: 'Un passo verso l\'autonomia: meno malcontento, ma assimilazione più lenta.' + POI }
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

// "fino al 26 maggio 752 a.C." se g e id sono in tregua, altrimenti null.
function fineTregua(game, g, id) {
  if (!inTruce(game, g, id)) return null;
  const d = dateFromDay(game.nazioni[g].tregue[id]);
  return `fino al ${d.day} ${MONTH_NAMES[d.month - 1]} ${d.year} a.C.`;
}

// Motivo per cui non si può dichiarare guerra, con la fine della tregua quando è quella a impedirlo.
function motivoGuerra(game, g, id) {
  const m = checkWar(game, g, id);
  return m === 'tregua in corso' ? `tregua in corso ${fineTregua(game, g, id)}` : m;
}

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
  if (d.capitaleSalva) parti.push('capitale mai ceduta');
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
    assedio: g ? siegeView(game, g, id) : null, // se i tuoi eserciti la assediano
    // due o più tuoi eserciti fermi qui: si possono unire con un clic
    unibili: (ids => (ids.length >= 2 ? ids : null))(Object.values(game.eserciti)
      .filter(a => a.prov === id && a.owner === g && !a.percorso.length && !a.inBattaglia).map(a => a.id)),
    // provincia di un popolo confinante: menu rapido per la guerra (motivo se non si può)
    popolo: g && p.owner !== g && game.ordine.includes(p.owner) && game.nazioni[p.owner].vivo && bordersNation(game, g, p.owner)
      ? { id: p.owner, nome: nome(game, p.owner), motivo: motivoGuerra(game, g, p.owner) } : null,
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
    motivoAlzare: n.stabilita >= 3 ? 'la stabilità è già al massimo (+3)' : n.tesoro < costo ? `servono ${costo.toFixed(1)} denari, ne hai ${n.tesoro.toFixed(1)}` : null,
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
        tregua: fineTregua(game, g, id),
        coalizione: ostili.includes(id),
        costoGuerra: hasPretext(game, g, id) ? 0 : game.balance.guerra.senzaPretesto,
        azioni: {
          ambasceria: checkEmbassy(game, g, id),
          alleanza: checkProposal(game, g, 'alleanza', id),
          rompi: allied(game, g, id) ? null : 'non siete alleati',
          esci: me.protettore === id ? checkLeaveFoedus(game, g) : 'non è il tuo protettore',
          foedus: checkProposal(game, g, 'foedus', id),
          tributo: checkProposal(game, g, 'tributo', id),
          guerra: motivoGuerra(game, g, id),
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
      // solo province che una pace può davvero prendere (niente capitali salve); ognuna va a chi la occupa
      daChiedere: prov.filter(p => nemici.includes(p.owner) && mine.includes(p.controller) && !validTerms(game, w, g, { province: [p.id] }))
        .map(p => ({ id: p.id, nome: p.nome, costo: costo(g, p.id), a: p.controller, verso: p.controller === g ? null : nome(game, p.controller), owner: p.owner })),
      daCedere: prov.filter(p => mine.includes(p.owner) && nemici.includes(p.controller) && !validTerms(game, w, nemici[0], { province: [p.id] }))
        .map(p => ({ id: p.id, nome: p.nome, costo: costo(nemici[0], p.id), a: p.controller, verso: nome(game, p.controller), owner: p.owner })),
      propostaInAttesa: Object.values(game.proposte).some(p => p.guerra === w.id && p.da === g),
      // quante province di ciascun popolo può prendere una pace, e quante delle tue
      limiti: nemici.filter(id => provincesOf(game, id).length).map(id => ({ id, nome: nome(game, id), max: maxCedibili(game, id) })),
      limiteMio: maxCedibili(game, g),
      denariMax: Math.max(0, Math.floor(game.nazioni[nemici[0]].tesoro)), // al più quanto ha nel tesoro il capofila nemico
      puntiPer10Denari: Math.round(peaceCost(game, w, g, { province: [], denari: 10 }) * 10) / 10,
      annessioni: nemici.filter(id => provincesOf(game, id).length).map(id => {
        const prov = provincesOf(game, id);
        const inf = game.balance.infamia, mia = game.nazioni[g];
        const motivo = w[side][0] !== g ? 'la pace la firma il capofila del tuo schieramento'
          : Object.values(game.proposte).some(p => p.guerra === w.id && p.da === g) ? 'hai già una proposta in attesa'
          : annexable(game, w, g, id);
        return {
          id, nome: nome(game, id), province: prov.map(p => p.id), motivo,
          // l'infamia la paga chi occupa ogni provincia: qui quella che pagheresti tu
          infamia: prov.filter(p => p.controller === g).reduce((s, p) => s + inf.perProvincia + (p.cultura !== mia.cultura ? inf.culturaDiversa : 0), 0)
        };
      })
    };
  });
}

const RUOLI = { bersaglio: 'il popolo che attacchi', alleato: 'suo alleato', federato: 'suo federato', protettore: 'suo protettore', coalizione: 'coalizione contro la tua infamia' };

// Conferma di una dichiarazione di guerra: schieramenti previsti, forze, costo di stabilità.
export function warConfirmView(game, g, target) {
  const v = warPreview(game, g, target);
  const forza = id => Math.round(power(game, id));
  const nemici = v.nemici.map(x => ({ id: x.id, nome: nome(game, x.id), ruolo: RUOLI[x.ruolo], forza: forza(x.id) }));
  const miei = [{ id: g, nome: nome(game, g), stato: 'tu', forza: forza(g), conta: true },
    ...v.federati.map(id => ({ id, nome: nome(game, id), stato: 'tuo federato: entra con te', forza: forza(id), conta: true })),
    ...v.chiamati.map(c => ({ id: c.id, nome: nome(game, c.id), stato: `alleato chiamato alle armi: ${c.probabile ? 'probabilmente accetta' : 'probabilmente rifiuta'}`, forza: forza(c.id), conta: c.probabile })),
    ...v.esclusi.map(e => ({ id: e.id, nome: nome(game, e.id), stato: `alleato che non entra: ${e.motivo}`, forza: forza(e.id), conta: false }))];
  return {
    bersaglio: { id: target, nome: nome(game, target) }, errore: v.errore, nemici, miei,
    forzaNemici: nemici.reduce((s, x) => s + x.forza, 0),
    forzaMiei: miei.filter(x => x.conta).reduce((s, x) => s + x.forza, 0),
    costo: v.pretesto ? 'Hai un pretesto: nessun costo di stabilità.' : `Senza pretesto: la stabilità scende da ${segno(v.stabilita.prima)} a ${segno(v.stabilita.dopo)}.`
  };
}

// Riepilogo subito dopo la dichiarazione: chi combatte davvero e chi deve ancora rispondere alla chiamata.
export function warSummaryView(game, g, warId) {
  const w = game.guerre[warId];
  if (!w) return null;
  const side = sideOf(w, g);
  return {
    miei: w[side].map(id => nome(game, id)),
    nemici: enemiesOf(w, side).map(id => nome(game, id)),
    chiamati: Object.values(game.proposte).filter(p => p.tipo === 'chiamata' && p.guerra === warId).map(p => nome(game, p.a))
  };
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
      // ogni provincia va a chi la occupa: se non sei tu, il testo lo dice
      const altrui = p.termini.province.some(id => game.province[id].controller !== g);
      const conPadrone = p.termini.province.map(id => {
        const q = game.province[id];
        return q.controller === g ? q.nome : `${q.nome} (a ${nome(game, q.controller)})`;
      }).join(', ');
      const soldi = p.termini.denari ? `${p.termini.province.length ? ' e ' : ''}${p.termini.denari} denari` : '';
      if (!p.termini.province.length && !p.termini.denari) testo = `${da} propone una pace bianca.`;
      else if (p.termini.ricevente === g) testo = altrui ? `${da} offre la pace e cede: ${conPadrone}${soldi}.` : `${da} offre la pace e ti cede: ${nomi}${soldi}.`;
      else testo = `${da} chiede la pace e vuole: ${nomi}${soldi}.`;
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
      if (!e.province.length && !e.denari) return `Pace bianca tra ${N(e.ricevente)} e ${altri}.`;
      const nomi = [e.ricevente, ...e.parti.filter(x => x !== e.ricevente)].map(N);
      const tra = `${nomi.slice(0, -1).join(', ')} e ${nomi.at(-1)}`;
      // ogni provincia va a chi la occupava (salvataggi vecchi: tutte al ricevente)
      const padroni = e.padroni ?? e.province.map(() => e.ricevente);
      const per = new Map();
      e.province.forEach((p, i) => per.set(padroni[i], [...(per.get(padroni[i]) ?? []), P(p)]));
      const soldi = e.denari ? `; ${N(e.pagatore)} paga ${e.denari} denari` : '';
      return `Pace tra ${tra}: ${[...per].map(([o, l]) => `${N(o)} ottiene ${l.join(', ')}`).join('; ')}${soldi}.`;
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
  const motivoUnire = armies.length < 2 ? 'seleziona almeno due tuoi eserciti (Shift + clic)'
    : armies.length !== ids.length ? 'nella selezione ci sono eserciti non tuoi'
    : !fermi ? 'gli eserciti in marcia o in battaglia non si uniscono'
    : !armies.every(a => a.prov === armies[0].prov) ? 'gli eserciti devono stare nella stessa provincia' : null;
  const motivoDividere = !uno ? 'seleziona un solo tuo esercito'
    : uno.inBattaglia ? 'un esercito in battaglia non si divide'
    : Math.floor(uno.fanteria / 2) + Math.floor(uno.cavalleria / 2) < min || Math.ceil(uno.fanteria / 2) + Math.ceil(uno.cavalleria / 2) < min
      ? `troppo piccolo: ogni metà deve avere almeno ${min} uomini` : null;
  const motivoRiunire = armies.length < 2 || armies.length !== ids.length ? 'seleziona almeno due tuoi eserciti (Shift + clic)'
    : armies.some(a => a.inBattaglia) ? 'un esercito in battaglia non può partire'
    : armies.every(a => a.prov === armies[0].prov) ? 'sono già nella stessa provincia: usa Unisci' : null;
  const motivoSciogliere = !armies.length ? 'seleziona uno o più tuoi eserciti'
    : armies.some(a => a.inBattaglia) ? 'un esercito in battaglia non si scioglie' : null;
  const risparmio = (armies.reduce((s, a) => s + a.fanteria + 2 * a.cavalleria, 0) / 1000 * game.balance.economia.mantenimento1000).toFixed(2);
  return {
    puoUnire: !motivoUnire, puoDividere: !motivoDividere, puoRiunire: !motivoRiunire, puoSciogliere: !motivoSciogliere,
    motivoUnire, motivoDividere, motivoRiunire, motivoSciogliere, risparmio
  };
}

// Perché il bottone di una richiesta di province è spento (null se si può inviare). owners: il padrone di ogni casella spuntata.
// denariMax null: richiesta senza denari (cedere province).
export function motivoRichiesta(owners, limiti, denari = 0, denariMax = null) {
  if (denariMax !== null && denari > denariMax) return `Al più ${denariMax} denari: è quanto ha nel tesoro.`;
  if (!owners.length && !denari) return denariMax === null ? 'Spunta almeno una provincia.' : 'Spunta almeno una provincia o chiedi dei denari.';
  const conta = {};
  for (const o of owners) conta[o] = (conta[o] ?? 0) + 1;
  const oltre = Object.entries(conta).find(([o, k]) => limiti[o] && k > limiti[o].max);
  if (!oltre) return null;
  const l = limiti[oltre[0]];
  return `Al più ${l.max} ${l.max === 1 ? 'provincia' : 'province'} di ${l.nome} per pace: togline qualcuna, oppure annetti tutto il popolo.`;
}

const ad = n => (/^[aA]/.test(n) ? `ad ${n}` : `a ${n}`);

// Battaglie in corso con i tuoi eserciti: i due schieramenti (uomini, morale medio) e cosa farebbe la ritirata.
export function battlesView(game, g) {
  const prov = [...new Set(Object.values(game.eserciti).filter(a => a.owner === g && a.inBattaglia).map(a => a.prov))].sort();
  return prov.map(id => {
    const qui = Object.values(game.eserciti).filter(a => a.prov === id && a.inBattaglia);
    const schieramento = list => {
      const uomini = list.reduce((s, a) => s + a.fanteria + a.cavalleria, 0);
      const morale = uomini ? list.reduce((s, a) => s + a.morale * (a.fanteria + a.cavalleria), 0) / uomini : 0;
      return { uomini, morale: morale.toFixed(1) };
    };
    const nemici = qui.filter(a => atWar(game, g, a.owner));
    const dove = nearestSafe(game, g, id);
    return {
      prov: id, nome: game.province[id].nome,
      miei: schieramento(qui.filter(a => !atWar(game, g, a.owner))),
      nemici: { ...schieramento(nemici), popoli: [...new Set(nemici.map(a => nome(game, a.owner)))] },
      motivoRitirata: checkRetreat(game, g, id),
      spiegaRitirata: dove
        ? `I tuoi eserciti qui perdono il 10% degli uomini e scappano ${ad(game.province[dove].nome)}; la battaglia conta come persa`
        : 'Non c\'è una provincia sicura dove scappare: i tuoi eserciti qui si scioglierebbero'
    };
  });
}

// L'assedio dei tuoi eserciti in una provincia nemica: forze, presidio, giorni alla caduta, assalto e ripiego.
export function siegeView(game, g, provId) {
  const p = game.province[provId];
  const mine = Object.values(game.eserciti).filter(a => a.prov === provId && a.owner === g && !a.percorso.length);
  if (!mine.length || p.controller === g || !atWar(game, g, p.controller)) return null;
  const info = siegeInfo(game, p), dove = nearestSafe(game, g, provId);
  return {
    prov: provId, nome: p.nome, fort: p.fort, presidio: garrison(game, p),
    uomini: mine.reduce((s, a) => s + a.fanteria + a.cavalleria, 0),
    giorni: info ? info.giorni : null,
    motivoAssedio: info ? null : mine.some(a => a.inBattaglia) ? 'si combatte: l\'assedio riprende dopo la battaglia' : 'ci sono nemici nella provincia: l\'assedio è fermo',
    probabilita: Math.round(assaultChance(game, g, p) * 100),
    motivoAttacco: checkAssault(game, g, provId),
    destinazione: dove ? game.province[dove].nome : null,
    motivoRipiego: mine.some(a => a.inBattaglia) ? 'sono in battaglia: usa la ritirata nel riquadro in alto' : dove ? null : 'nessuna provincia sicura dove ripiegare'
  };
}
