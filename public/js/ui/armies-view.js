// Dove si disegnano gli eserciti e i loro percorsi: funzioni pure, in coordinate della mappa o dello schermo.
import { travelDays } from '../sim/armies.js';

export function armyWorldPos(game, army, centri, fraz = 0) {
  const [x0, y0] = centri[army.prov];
  if (!army.percorso.length) return { x: x0, y: y0, dir: 1, inMarcia: false };
  const next = army.percorso[0];
  const [x1, y1] = centri[next];
  const tot = travelDays(game, army.prov, next);
  const t = Math.max(0, Math.min(1, (tot - army.giorniAlProssimo + fraz) / tot));
  return { x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, dir: x1 >= x0 ? 1 : -1, inMarcia: true };
}

export function pathSteps(game, army, centri, fraz = 0) {
  if (!army.percorso.length) return [];
  const p = armyWorldPos(game, army, centri, fraz);
  const steps = [{ da: [p.x, p.y], a: centri[army.percorso[0]], giorni: army.giorniAlProssimo }];
  for (let i = 1; i < army.percorso.length; i++) {
    const da = army.percorso[i - 1], a = army.percorso[i];
    steps.push({ da: centri[da], a: centri[a], giorni: travelDays(game, da, a) });
  }
  return steps;
}

export function stackOffset(i, n) {
  return (i - (n - 1) / 2) * 30;
}

export function armiesInRect(markers, { x0, y0, x1, y1 }, owner) {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  return markers.filter(m => m.owner === owner && m.x >= ax && m.x <= bx && m.y >= ay && m.y <= by).map(m => m.id);
}

// Più grandi quando si ingrandisce, entro un minimo e un massimo.
export function soldierScale(camera) {
  return Math.max(0.8, Math.min(1.4, 0.7 + (camera.scale / camera.min) * 0.07));
}

// Quali eserciti disegnare in una provincia: per ogni popolo al più 3 (i selezionati e poi i più grandi);
// altri[popolo] conta quelli nascosti, da mostrare come "+N".
export function visibleStack(list, scelti = [], max = 3) {
  const per = {};
  for (const a of list) (per[a.owner] ??= []).push(a);
  const visibili = [], altri = {};
  for (const [owner, gruppo] of Object.entries(per)) {
    const ordinati = [...gruppo].sort((a, b) => Number(scelti.includes(b.id)) - Number(scelti.includes(a.id)) ||
      (b.fanteria + b.cavalleria) - (a.fanteria + a.cavalleria) || (a.id < b.id ? -1 : 1));
    visibili.push(...ordinati.slice(0, max));
    if (ordinati.length > max) altri[owner] = ordinati.length - max;
  }
  return { visibili: list.filter(a => visibili.includes(a)), altri };
}
