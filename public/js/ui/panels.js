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
    `<div class="muto">${esc(c.tratti || 'nessun tratto')}</div><p>${esc(c.carattere)}</p>`;
}

export function provinceHtml(v) {
  const righe = [['Proprietario', v.proprietario.nome], ...(v.occupante ? [['Occupata da', v.occupante.nome]] : []),
    ['Cultura', v.cultura], ['Terreno', v.terreno], ['Tasse', v.tasse], ['Uomini', v.uomini], ['Fortificazione', v.fort]];
  const eserciti = v.eserciti.length
    ? v.eserciti.map(e => `<div class="riga"><span>${esc(e.nazione)}: ${e.uomini} uomini, morale ${esc(e.morale)}</span>` +
      (e.mio ? `<button data-azione="seleziona-esercito" data-id="${esc(e.id)}">Seleziona</button>` : '') + '</div>').join('')
    : '<p class="muto">Nessun esercito.</p>';
  const recluta = v.puoReclutare
    ? '<h3>Recluta</h3><div class="comandi">' +
      '<label>Fanti <input id="r-fanti" type="number" min="0" step="100" value="1000"></label>' +
      '<label>Cavalieri <input id="r-cavalieri" type="number" min="0" step="100" value="0"></label>' +
      `<button data-azione="recluta" data-id="${esc(v.id)}">Recluta</button></div>`
    : '';
  return `<h2>${esc(v.nome)}</h2><table>${righe.map(([k, x]) => `<tr><td>${k}</td><td>${esc(x)}</td></tr>`).join('')}</table>` +
    `<h3>Eserciti</h3>${eserciti}${recluta}`;
}

export function governoHtml(v) {
  return `<h3>${esc(v.nome)}</h3><table>` +
    `<tr><td>Governo</td><td>${esc(v.governo)}</td></tr>` +
    `<tr><td>Stabilità</td><td>${esc(v.stabilita)}</td></tr>` +
    `<tr><td>Tratti</td><td>${esc(v.tratti || 'nessuno')}</td></tr></table>` +
    `<div class="comandi"><button data-azione="alza-stabilita"${v.puoAlzare ? '' : ' disabled'}>Alza stabilità (${esc(v.costoStabilita)} denari)</button></div>`;
}

export function diplomaziaHtml(list) {
  if (!list.length) return '<p class="muto">Nessun vicino.</p>';
  return list.map(d => {
    const stato = d.stato === 'guerra' ? '<span class="guerra">in guerra</span>'
      : d.stato === 'tregua' ? `tregua fino al ${esc(d.finoA)}` : 'in pace';
    const bottone = d.puoDichiarare
      ? `<button data-azione="dichiara" data-id="${esc(d.id)}">Dichiara guerra${d.costo ? ` (−${d.costo} stab.)` : ''}</button>` : '';
    return `<div class="riga"><span>${esc(d.nome)} <span class="muto">${stato}</span></span>${bottone}</div>`;
  }).join('');
}

export function esercitiHtml(list, selezionato) {
  if (!list.length) return '<p class="muto">Nessun esercito. Recluta da una tua provincia.</p>';
  return list.map(a => `<div class="riga${a.id === selezionato ? ' scelta' : ''}"><span>${esc(a.provincia)}: ` +
    `${a.fanteria} fanti, ${a.cavalleria} cavalieri, morale ${esc(a.morale)}` +
    (a.destinazione ? ` → ${esc(a.destinazione)}` : '') +
    (a.inBattaglia ? ' <span class="guerra">in battaglia</span>' : '') +
    `</span><button data-azione="seleziona-esercito" data-id="${esc(a.id)}">Seleziona</button></div>`).join('') +
    '<p class="muto">Seleziona un esercito, poi clic destro sulla destinazione.</p>';
}

function caselle(nome, list) {
  return list.map(p => `<label class="riga"><span><input type="checkbox" name="${esc(nome)}" value="${esc(p.id)}"> ${esc(p.nome)}</span>` +
    `<span class="muto">costo ${p.costo}</span></label>`).join('');
}

export function guerreHtml(list) {
  if (!list.length) return '<p class="muto">Nessuna guerra.</p>';
  return list.map(w => `<div><h3>Contro ${esc(w.nemico.nome)}</h3><div>Sei ${w.ruolo}. Punteggio: <b>${w.punteggio}</b></div>` +
    (w.daChiedere.length ? `<div class="muto">Province occupate che puoi chiedere:</div>${caselle(`chiedi-${w.id}`, w.daChiedere)}` : '') +
    (w.daCedere.length ? `<div class="muto">Tue province occupate che puoi cedere:</div>${caselle(`cedi-${w.id}`, w.daCedere)}` : '') +
    '<div class="comandi">' + (w.propostaInAttesa
      ? '<span class="muto">Proposta in attesa di risposta.</span>'
      : `<button data-azione="chiedi" data-id="${esc(w.id)}" data-nemico="${esc(w.nemico.id)}">Chiedi le province</button>` +
        `<button data-azione="cedi" data-id="${esc(w.id)}" data-nemico="${esc(w.nemico.id)}">Cedi e fai la pace</button>` +
        `<button data-azione="pace-bianca" data-id="${esc(w.id)}" data-nemico="${esc(w.nemico.id)}">Pace bianca</button>`) +
    '</div></div>').join('');
}
