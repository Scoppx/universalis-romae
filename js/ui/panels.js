// Costruttori di HTML per i pannelli: ricevono i modelli di views.js e restituiscono stringhe.
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const diffClass = d => `diff-${d.replace(' ', '-')}`;

export function cardsHtml(cards, scelto) {
  return cards.map(c => `<div class="carta${c.id === scelto ? ' scelta' : ''}" data-popolo="${esc(c.id)}">` +
    `<span class="colore" style="background:${esc(c.colore)}"></span>${esc(c.nome)}` +
    `<span class="diff ${diffClass(c.difficolta)}">${esc(c.difficolta)}</span></div>`).join('');
}

export function cardDetailHtml(c) {
  return `<h3>${esc(c.nome)}</h3>` +
    `<div>Difficoltà: <b class="${diffClass(c.difficolta)}">${esc(c.difficolta)}</b> · ${esc(c.governo)}</div>` +
    `<div class="muto">${esc(c.tratti || 'nessun tratto')}</div>` +
    (c.bonus ? `<div class="muto">Bonus della difficoltà: ${esc(c.bonus)}</div>` : '') + `<p>${esc(c.carattere)}</p>`;
}

export function provinceHtml(v) {
  const righe = [['Proprietario', v.proprietario.nome], ...(v.occupante ? [['Occupata da', v.occupante.nome]] : []),
    ['Cultura', v.cultura], ['Terreno', v.terreno], ['Tasse', v.tasse], ['Uomini', v.uomini], ['Fortificazione', v.fort],
    ['Malcontento', `${v.malcontento}/10`], ...(v.assimilazione !== null && v.assimilazione !== undefined ? [['Assimilazione', `${v.assimilazione}%`]] : []),
    ...(v.colonia ? [['Colonia', 'sì']] : [])];
  const eserciti = v.eserciti.length
    ? v.eserciti.map(e => `<div class="riga"><span>${esc(e.nazione)}: ${esc(e.uomini)} uomini, morale ${esc(e.morale)}</span>` +
      (e.mio ? `<button data-azione="seleziona-esercito" data-id="${esc(e.id)}">Seleziona</button>` : '') + '</div>').join('')
    : '<p class="muto">Nessun esercito.</p>';
  const recluta = v.puoReclutare
    ? '<h3>Recluta</h3><div class="comandi">' +
      '<label>Fanti <input id="r-fanti" type="number" min="0" step="100" value="1000"></label>' +
      '<label>Cavalieri <input id="r-cavalieri" type="number" min="0" step="100" value="0"></label>' +
      `<button data-azione="recluta" data-id="${esc(v.id)}">Recluta</button></div>`
    : '';
  const azioni = v.azioni ? '<h3>Provincia</h3><div class="comandi">' +
    bottone('colonia', v.id, `Fonda colonia (${v.azioni.colonia.costo} denari, ${v.azioni.colonia.uomini} uomini)`, v.azioni.colonia.motivo) +
    bottone('fortifica', v.id, v.azioni.fortifica.costo === null ? 'Fortificazione al massimo' : `Fortifica (${v.azioni.fortifica.costo} denari)`, v.azioni.fortifica.motivo) +
    '</div>' : '';
  return `<h2>${esc(v.nome)}</h2><table>${righe.map(([k, x]) => `<tr><td>${k}</td><td>${esc(x)}</td></tr>`).join('')}</table>` +
    `<h3>Eserciti</h3>${eserciti}${recluta}${azioni}`;
}

export function governoHtml(v) {
  const leva = l => `<div class="leva"><span class="nome">${esc(l.nome)}</span>` +
    `<button class="piccolo" data-azione="slider" data-quale="${esc(l.quale)}" data-verso="-1"${l.meno ? ` disabled title="${esc(l.meno)}"` : ''}>◀ ${esc(l.sinistra)}</button>` +
    `<b>${esc(l.valore)}</b>` +
    `<button class="piccolo" data-azione="slider" data-quale="${esc(l.quale)}" data-verso="1"${l.piu ? ` disabled title="${esc(l.piu)}"` : ''}>${esc(l.destra)} ▶</button></div>`;
  return `<h3>${esc(v.nome)}</h3><table>` +
    `<tr><td>Governo</td><td>${esc(v.governo)}${v.effettiGoverno ? ` <span class="muto">(${esc(v.effettiGoverno)})</span>` : ''}</td></tr>` +
    `<tr><td>Stabilità</td><td>${esc(v.stabilita)}</td></tr>` +
    `<tr><td>Tratti</td><td>${esc(v.tratti || 'nessuno')}</td></tr></table>` +
    `<div class="comandi"><button data-azione="alza-stabilita"${v.puoAlzare ? '' : ' disabled'}>Alza stabilità (${esc(v.costoStabilita)} denari)</button></div>` +
    `<h3>Riforme</h3>${v.slider.map(leva).join('')}`;
}

const STATI = { guerra: 'in guerra', tregua: 'tregua', alleato: 'alleato', federato: 'tuo federato', protettore: 'tuo protettore', pace: 'in pace' };

function bottone(azione, id, testo, motivo) {
  return `<button class="piccolo" data-azione="${azione}" data-id="${esc(id)}"${motivo ? ` disabled title="${esc(motivo)}"` : ''}>${esc(testo)}</button>`;
}

export function diplomaziaHtml(list) {
  if (!list.length) return '<p class="muto">Nessun altro popolo.</p>';
  const riga = d => {
    const pct = Math.round((d.relazione + 200) / 4);
    return `<div class="dipl"><div class="riga"><span><b>${esc(d.nome)}</b> <span class="muto">${esc(STATI[d.stato])}` +
      `${d.coalizione ? ' · <span class="guerra">coalizione contro di te</span>' : ''}</span></span>` +
      `<span class="rel" title="relazione ${esc(d.relazione)}"><span style="width:${pct}%"></span></span></div>` +
      '<div class="comandi">' +
      bottone('ambasceria', d.id, 'Ambasceria', d.azioni.ambasceria) +
      (d.stato === 'alleato' ? bottone('rompi', d.id, 'Rompi alleanza', d.azioni.rompi)
        : d.stato === 'protettore' ? bottone('esci', d.id, 'Esci dal foedus (−2 stab.)', d.azioni.esci)
        : bottone('alleanza', d.id, 'Alleanza', d.azioni.alleanza)) +
      bottone('foedus', d.id, 'Foedus', d.azioni.foedus) +
      bottone('tributo', d.id, 'Tributo', d.azioni.tributo) +
      (d.azioni.ultimatum.province.length
        ? `<select id="ult-${esc(d.id)}">${d.azioni.ultimatum.province.map(p => `<option value="${esc(p.id)}">${esc(p.nome)}</option>`).join('')}</select>` +
          bottone('ultimatum', d.id, 'Ultimatum', null)
        : '') +
      bottone('dichiara', d.id, `Guerra${d.costoGuerra ? ` (−${d.costoGuerra} stab.)` : ''}`, d.azioni.guerra) +
      '</div></div>';
  };
  const vicini = list.filter(d => d.confina), altri = list.filter(d => !d.confina);
  return (vicini.length ? `<h3>Confinanti</h3>${vicini.map(riga).join('')}` : '') +
    (altri.length ? `<h3>Altri popoli</h3>${altri.map(riga).join('')}` : '');
}

export function esercitiHtml(list, azioni) {
  if (!list.length) return '<p class="muto">Nessun esercito. Recluta da una tua provincia.</p>';
  return '<div class="comandi">' +
    `<button data-azione="unisci"${azioni.puoUnire ? '' : ' disabled'}>Unisci</button>` +
    `<button data-azione="dividi"${azioni.puoDividere ? '' : ' disabled'}>Dividi</button></div>` +
    list.map(a => `<div class="riga${a.scelto ? ' scelta' : ''}"><span>${esc(a.provincia)}: ` +
      `${esc(a.fanteria)} fanti, ${esc(a.cavalleria)} cavalieri, morale ${esc(a.morale)}` +
      (a.destinazione ? ` → ${esc(a.destinazione)}` : '') +
      (a.inBattaglia ? ' <span class="guerra">in battaglia</span>' : '') +
      `</span><button data-azione="seleziona-esercito" data-id="${esc(a.id)}">Seleziona</button></div>`).join('') +
    '<p class="muto">Clic sul soldatino per selezionarlo, Maiuscolo+clic o Maiuscolo+trascina per sceglierne più d\'uno, clic destro sulla destinazione.</p>';
}

function caselle(nome, list) {
  return list.map(p => `<label class="riga"><span><input type="checkbox" name="${esc(nome)}" value="${esc(p.id)}"> ${esc(p.nome)}</span>` +
    `<span class="muto">costo ${esc(p.costo)}</span></label>`).join('');
}

export function guerreHtml(list) {
  if (!list.length) return '<p class="muto">Nessuna guerra.</p>';
  return list.map(w => `<div><h3>Contro ${esc(w.nemico.nome)}</h3><div>Sei ${esc(w.ruolo)}. Punteggio: <b>${esc(w.punteggio)}</b></div>` +
    (w.daChiedere.length ? `<div class="muto">Province occupate che puoi chiedere (al più ${esc(w.maxChiedibili)} di ${esc(w.nemico.nome)} per pace):</div>${caselle(`chiedi-${w.id}`, w.daChiedere)}` : '') +
    (w.daCedere.length ? `<div class="muto">Tue province occupate che puoi cedere:</div>${caselle(`cedi-${w.id}`, w.daCedere)}` : '') +
    '<div class="comandi">' + (!w.capofila
      ? '<span class="muto">La pace la firma il capofila del tuo schieramento.</span>'
      : w.propostaInAttesa
      ? '<span class="muto">Proposta in attesa di risposta.</span>'
      : `<button data-azione="chiedi" data-id="${esc(w.id)}" data-nemico="${esc(w.nemico.id)}">Chiedi le province</button>` +
        `<button data-azione="cedi" data-id="${esc(w.id)}" data-nemico="${esc(w.nemico.id)}">Cedi e fai la pace</button>` +
        `<button data-azione="pace-bianca" data-id="${esc(w.id)}" data-nemico="${esc(w.nemico.id)}">Pace bianca</button>`) +
    '</div></div>').join('');
}

export function proposalHtml(p) {
  return `<h3>${esc(p.titolo)}</h3><p>${esc(p.testo)}</p><div class="comandi">` +
    `<button data-azione="rispondi" data-id="${esc(p.id)}" data-accetta="1">Accetta</button>` +
    `<button data-azione="rispondi" data-id="${esc(p.id)}" data-accetta="0">Rifiuta</button></div>`;
}

export function rankingHtml(titolo, list) {
  return `<h2>${esc(titolo)}</h2><table>` +
    list.map(r => `<tr${r.tu ? ' style="font-weight:bold"' : ''}><td>${esc(r.pos)}</td>` +
      `<td>${esc(r.nome)}${r.vivo ? '' : ' <span class="muto">(scomparso)</span>'}</td><td>${esc(r.punteggio)}</td></tr>`).join('') +
    '</table><div class="comandi"><button data-azione="chiudi">Chiudi</button></div>';
}

const FONTI = { jev: 'Jev', prudenza: 'Jev incerto: prudenza', regola: 'regola (Jev non disponibile)', superata: 'superata dagli eventi' };

export function consiglioHtml(list, nazioni, filtro) {
  const scelta = `<label class="muto">Popolo <select id="consiglio-filtro"><option value="">tutti</option>` +
    nazioni.map(n => `<option value="${esc(n.id)}"${n.id === filtro ? ' selected' : ''}>${esc(n.nome)}</option>`).join('') +
    '</select></label>';
  if (!list.length) return `${scelta}<p class="muto">Ancora nessuna decisione.</p>`;
  return scelta + list.map(d => `<div class="voto"><div><b>${esc(d.nazione)}</b> · ${esc(d.domanda)} <span class="muto">${esc(d.data)}</span></div>` +
    d.opzioni.map(o => `<div class="barra-voto${o.nome === d.scelta ? ' scelta' : ''}"><span>${esc(o.nome)}</span>` +
      `<span class="riempi" style="width:${esc(o.p)}%"></span><span class="pct">${esc(o.p)}%</span></div>`).join('') +
    `<div class="muto">scelta: ${esc(d.scelta ?? '—')} · ${esc(FONTI[d.fonte] ?? d.fonte)}</div></div>`).join('');
}

export function eventoHtml(v) {
  return `<h2>${esc(v.titolo)}</h2><p>${esc(v.testo)}</p>` + v.opzioni.map(o =>
    `<div class="opzione"><button data-azione="scegli" data-id="${esc(v.id)}" data-opzione="${esc(o.id)}">${esc(o.testo)}</button>` +
    `<div class="muto">${esc(o.effetti)}</div></div>`).join('');
}
