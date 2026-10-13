// Colori delle province per modalità della mappa.
import { atWar, inTruce } from '../sim/war.js';
import { allied, coalition } from '../sim/diplomacy.js';

export const TERRENO = { pianura: '#c8cf8f', collina: '#b9a56d', montagna: '#8d7d6a', palude: '#7d9a86' };
export const RELAZIONE = {
  tu: '#d4a017', guerra: '#b03a2e', alleato: '#3f6fb0', federato: '#8fb3dd',
  coalizione: '#8a4b1c', tregua: '#e08e3c', neutrale: '#d9ccaa'
};

export function relazioneStato(game, g, id) {
  if (id === g) return 'tu';
  if (atWar(game, g, id)) return 'guerra';
  if (allied(game, g, id)) return 'alleato';
  if (game.nazioni[id].protettore === g || game.nazioni[g].protettore === id) return 'federato';
  if (coalition(game, g).includes(id)) return 'coalizione';
  if (inTruce(game, g, id)) return 'tregua';
  return 'neutrale';
}

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
      return giocatore ? RELAZIONE[relazioneStato(game, giocatore, prov.owner)] : RELAZIONE.neutrale;
    default:
      return game.nazioni[prov.owner].colore;
  }
}

// Tutto ciò da cui dipendono i colori della mappa: se non cambia, la base disegnata resta valida.
export function fillSignature(game, modo, giocatore) {
  let s = '';
  for (const p of Object.values(game.province)) s += `${p.owner},${p.controller};`;
  if (modo === 'relazioni' && giocatore) {
    for (const id of game.ordine) s += relazioneStato(game, giocatore, id).slice(0, 3);
  }
  return s;
}
