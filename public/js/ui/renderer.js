// Disegno della mappa a due strati. La base (mare, rilievo, popoli, confini, acque, nomi) sta in una tela nascosta
// e si ridisegna solo quando cambiano vista o confini; selezione, percorsi e soldatini a ogni fotogramma.
import { provinceFill, fillSignature } from './colors.js';
import { coalition } from '../sim/diplomacy.js';
import { atWar } from '../sim/war.js';
import { toScreen } from './camera.js';
import { drawSoldier, drawLabel, drawArrow, drawMore } from './soldier.js';
import { visibleStack, armyWorldPos, pathSteps, stackOffset, soldierScale } from './armies-view.js';

const MARE = '#cddcd8', TERRA = '#efe3c8', INCHIOSTRO = '#3b2a1a', ACQUA = '#3d6e9e';

function toPath(multi) {
  const path = new Path2D();
  for (const poly of multi) for (const ring of poly) {
    ring.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
  }
  return path;
}

function linePath(punti) {
  const path = new Path2D();
  punti.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
  return path;
}

export function createRenderer(canvas, map, { onReady } = {}) {
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  const bctx = base.getContext('2d');
  const paths = Object.fromEntries(map.province.map(p => [p.id, toPath(p.poligoni)]));
  const centri = Object.fromEntries(map.province.map(p => [p.id, p.centro]));
  const decor = map.decorazioni.map(d => ({ tipo: d.tipo, path: toPath(d.poligoni) }));
  const terra = new Path2D();
  for (const p of map.province) terra.addPath(paths[p.id]);
  for (const d of decor) terra.addPath(d.path);
  const fiumi = (map.fiumi ?? []).map(f => ({ rank: f.rank, path: linePath(f.punti) }));
  const laghi = (map.laghi ?? []).map(l => toPath([l]));
  const confini = (map.confini ?? []).map(c => ({ a: c.a, b: c.b, path: linePath(c.punti) }));
  const stripes = {};
  let size = { w: 0, h: 0 }, chiaveBase = null, markers = [], pronto = false;

  const rilievo = new Image();
  rilievo.onload = () => { pronto = true; chiaveBase = null; onReady?.(); };
  rilievo.src = 'img/rilievo.jpg';

  function stripe(color) {
    if (stripes[color]) return stripes[color];
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d');
    g.strokeStyle = color; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(0, 8); g.lineTo(8, 0); g.moveTo(-2, 2); g.lineTo(2, -2); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
    return (stripes[color] = bctx.createPattern(c, 'repeat'));
  }

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = base.width = Math.round(r.width * dpr);
    canvas.height = base.height = Math.round(r.height * dpr);
    size = { w: r.width, h: r.height };
    chiaveBase = null;
    return size;
  }

  function drawBase(game, giocatore, modo, camera, evidenzia) {
    const g = bctx, dpr = window.devicePixelRatio || 1, lw = 1 / camera.scale;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = MARE;
    g.fillRect(0, 0, size.w, size.h);
    g.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.x, dpr * camera.y);
    // linee di costa ripetute sul mare, come nelle carte incise
    // angoli arrotondati: con gli spigoli vivi le isolette avevano ombre a punta
    g.strokeStyle = 'rgba(59, 42, 26, 0.06)'; g.lineJoin = 'round';
    for (const w of [26, 18, 11, 5]) { g.lineWidth = w * lw; g.stroke(terra); }
    g.fillStyle = TERRA;
    g.fill(terra);
    if (pronto) { g.save(); g.clip(terra); g.drawImage(rilievo, 0, 0, map.width, map.height); g.restore(); }
    for (const d of decor) if (d.tipo === 'incognita') { g.fillStyle = 'rgba(120, 110, 95, 0.45)'; g.fill(d.path); }
    const provs = Object.values(game.province);
    g.globalAlpha = 0.42;
    const coal = modo === 'relazioni' && giocatore ? coalition(game, giocatore) : [];
    for (const p of provs) { g.fillStyle = provinceFill(game, p, modo, giocatore, coal); g.fill(paths[p.id]); }
    g.globalAlpha = 0.8;
    for (const p of provs) if (p.controller !== p.owner) { g.fillStyle = stripe(game.nazioni[p.controller].colore); g.fill(paths[p.id]); }
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(59, 42, 26, 0.45)'; g.lineWidth = 0.6 * lw; g.setLineDash([3 * lw, 2 * lw]);
    for (const c of confini) if (game.province[c.a].owner === game.province[c.b].owner) g.stroke(c.path);
    g.setLineDash([]);
    g.strokeStyle = 'rgba(43, 28, 15, 0.85)'; g.lineWidth = 1.8 * lw; g.lineJoin = 'round';
    for (const c of confini) if (game.province[c.a].owner !== game.province[c.b].owner) g.stroke(c.path);
    g.fillStyle = '#b9d0d6'; g.strokeStyle = ACQUA; g.lineWidth = 0.7 * lw;
    for (const l of laghi) { g.fill(l); g.stroke(l); }
    g.lineCap = 'round';
    for (const f of fiumi) { g.lineWidth = (f.rank <= 4 ? 1.6 : f.rank <= 7 ? 1.1 : 0.7) * lw; g.stroke(f.path); }
    g.strokeStyle = INCHIOSTRO; g.lineWidth = 0.9 * lw;
    g.stroke(terra);
    if (evidenzia) {
      g.strokeStyle = '#1b120a'; g.lineWidth = 2.4 * lw;
      for (const p of provs) if (p.owner === evidenzia) g.stroke(paths[p.id]);
    }
    if (camera.scale >= 1.6) {
      g.fillStyle = 'rgba(27, 18, 10, 0.8)'; g.font = `italic ${11 * lw}px Georgia`; g.textAlign = 'center';
      for (const p of provs) g.fillText(p.nome, centri[p.id][0], centri[p.id][1] - 16 * lw);
    }
  }

  function draw({ game, giocatore, modo, selezione, camera, evidenzia, fraz = 0, now = 0, inPausa = true, rettangolo = null }) {
    const chiave = [camera.x, camera.y, camera.scale, modo, giocatore, evidenzia, size.w, size.h, pronto, fillSignature(game, modo, giocatore)].join('|');
    if (chiave !== chiaveBase) { drawBase(game, giocatore, modo, camera, evidenzia); chiaveBase = chiave; }
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(base, 0, 0);
    if (selezione.provincia) {
      ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.x, dpr * camera.y);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5 / camera.scale;
      ctx.stroke(paths[selezione.provincia]);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scr = ([x, y]) => toScreen(camera, x, y);
    for (const id of selezione.eserciti) {
      const a = game.eserciti[id];
      if (!a) continue;
      for (const s of pathSteps(game, a, centri, fraz)) drawArrow(ctx, scr(s.da), scr(s.a), `${s.giorni}g`);
    }
    markers = [];
    const scala = soldierScale(camera);
    const perProv = {};
    for (const a of Object.values(game.eserciti)) (perProv[a.prov] ??= []).push(a);
    for (const tutti of Object.values(perProv)) {
      const { visibili: list, altri } = visibleStack(tutti, selezione.eserciti);
      const pos = list.map((a, i) => {
        const p = armyWorldPos(game, a, centri, fraz);
        const [sx, sy] = scr([p.x, p.y]);
        return { p, x: sx + stackOffset(i, list.length) * scala, y: sy + 6 };
      });
      list.forEach((a, i) => {
        const { p, x, y } = pos[i];
        // in battaglia ognuno guarda verso i nemici che ha accanto
        const nemici = pos.filter((_, j) => list[j].inBattaglia && atWar(game, a.owner, list[j].owner));
        const dir = a.inBattaglia && nemici.length
          ? (nemici.reduce((s, n) => s + n.x, 0) / nemici.length >= x ? 1 : -1)
          : p.dir;
        const assedio = !a.inBattaglia && !a.percorso.length && game.province[a.prov].controller !== a.owner;
        const fase = inPausa ? 0 : now / 1000 * (a.inBattaglia ? 6 : 9);
        drawSoldier(ctx, {
          x, y, colore: game.nazioni[a.owner].colore, dir, fase, scala,
          scelto: selezione.eserciti.includes(a.id), inMarcia: p.inMarcia, battaglia: a.inBattaglia, assedio
        });
        drawLabel(ctx, x, y, a.fanteria + a.cavalleria, a.morale, game.balance.combattimento.moraleMax, scala);
        markers.push({ id: a.id, x, y: y - 14 * scala, owner: a.owner });
        // dopo l'ultimo soldatino di un popolo, quanti suoi eserciti non sono disegnati
        if (altri[a.owner] && !list.slice(i + 1).some(b => b.owner === a.owner)) drawMore(ctx, x + 14 * scala, y - 22 * scala, altri[a.owner], scala);
      });
    }
    if (rettangolo) {
      ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 3]);
      ctx.strokeRect(rettangolo.x0, rettangolo.y0, rettangolo.x1 - rettangolo.x0, rettangolo.y1 - rettangolo.y0);
      ctx.setLineDash([]);
    }
  }

  return { resize, draw, markers: () => markers, rilievoPronto: () => pronto };
}
