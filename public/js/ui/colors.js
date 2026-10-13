// Colori delle province per modalità della mappa.
import { atWar, inTruce } from '../sim/war.js';

export const TERRENO = { pianura: '#c8cf8f', collina: '#b9a56d', montagna: '#8d7d6a', palude: '#7d9a86' };
export const RELAZIONE = { tu: '#d4a017', guerra: '#b03a2e', tregua: '#e08e3c', neutrale: '#d9ccaa' };

export function cultureColor(cultura) {
  let h = 0;
  for (const ch of cultura) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360}, 42%, 58%)`;
}

export function provinceFill(game, prov, modo, giocatore) {
  switch (modo) {
    case 'cultura': return cultureColor(prov.cultura);
    case 'terreno': return TERRENO[prov.terreno];
    case 'relazioni':
      if (!giocatore) return RELAZIONE.neutrale;
      if (prov.owner === giocatore) return RELAZIONE.tu;
      if (atWar(game, giocatore, prov.owner)) return RELAZIONE.guerra;
      if (inTruce(game, giocatore, prov.owner)) return RELAZIONE.tregua;
      return RELAZIONE.neutrale;
    default:
      return game.nazioni[prov.owner].colore;
  }
}

// Tutto ciò da cui dipendono i colori della mappa: se non cambia, la base disegnata resta valida.
export function fillSignature(game, modo, giocatore) {
  let s = '';
  for (const p of Object.values(game.province)) s += `${p.owner},${p.controller};`;
  if (modo === 'relazioni' && giocatore) {
    for (const id of game.ordine) s += atWar(game, giocatore, id) ? 'g' : inTruce(game, giocatore, id) ? 't' : '-';
  }
  return s;
}
