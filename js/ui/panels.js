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
