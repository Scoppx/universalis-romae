// Governo e slider: tre leve da −5 a +5, una mossa ogni 10 anni (15 per le repubbliche).
import { governmentOf, sliderOf } from './state.js';

export const SLIDER = ['societa', 'guerra', 'governo'];

// Valori iniziali; non tocca quelli già presenti (salvataggi vecchi, popoli nuovi).
export function initGovernment(game) {
  for (const id of game.ordine) {
    const n = game.nazioni[id];
    n.slider ??= { societa: 0, guerra: 0, governo: 0 };
    n.ultimoSlider ??= null;
  }
}

export function sliderInterval(game, id) {
  return 365 * (governmentOf(game, id).intervalloSlider ?? game.balance.slider.intervalloAnni);
}

export function checkSlider(game, id, quale, verso) {
  const n = game.nazioni[id];
  if (!n?.vivo || !game.ordine.includes(id)) return 'nazione inesistente';
  if (!SLIDER.includes(quale)) return 'slider sconosciuto';
  if (verso !== 1 && verso !== -1) return 'verso non valido';
  if (Math.abs(sliderOf(game, id)[quale] + verso) > game.balance.slider.limite) return 'già al limite';
  if (n.ultimoSlider !== null && n.ultimoSlider !== undefined) {
    const resta = n.ultimoSlider + sliderInterval(game, id) - game.day;
    if (resta > 0) return `prossima riforma tra ${Math.ceil(resta / 365)} anni`;
  }
  return null;
}

export function moveSlider(game, id, quale, verso) {
  const err = checkSlider(game, id, quale, verso);
  if (err) return { ok: false, motivo: err };
  const n = game.nazioni[id];
  n.slider = { ...sliderOf(game, id) };
  n.slider[quale] += verso;
  n.ultimoSlider = game.day;
  return { ok: true };
}
