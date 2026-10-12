// Disegno della mappa su Canvas 2D: province, occupazioni, selezione, percorso, eserciti.
import { provinceFill } from './colors.js';
import { toScreen } from './camera.js';

function toPath(multi) {
  const path = new Path2D();
  for (const poly of multi) for (const ring of poly) {
    ring.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
  }
  return path;
}

export function createRenderer(canvas, map) {
  const ctx = canvas.getContext('2d');
  const paths = Object.fromEntries(map.province.map(p => [p.id, toPath(p.poligoni)]));
  const centri = Object.fromEntries(map.province.map(p => [p.id, p.centro]));
  const decor = map.decorazioni.map(d => ({ tipo: d.tipo, path: toPath(d.poligoni) }));
  const stripes = {};
  let markers = [];
  let size = { w: 0, h: 0 };

  // Righe diagonali nel colore di chi occupa la provincia.
  function stripe(color) {
    if (stripes[color]) return stripes[color];
    const c = document.createElement('canvas');
    c.width = c.height = 8;
    const g = c.getContext('2d');
    g.strokeStyle = color;
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(0, 8); g.lineTo(8, 0);
    g.moveTo(-2, 2); g.lineTo(2, -2);
    g.moveTo(6, 10); g.lineTo(10, 6);
    g.stroke();
    return (stripes[color] = ctx.createPattern(c, 'repeat'));
  }

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    size = { w: r.width, h: r.height };
    return size;
  }

  function draw({ game, giocatore, modo, selezione, camera, evidenzia }) {
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#a9c4c9';
    ctx.fillRect(0, 0, size.w, size.h);
    ctx.setTransform(dpr * camera.scale, 0, 0, dpr * camera.scale, dpr * camera.x, dpr * camera.y);
    for (const d of decor) {
      ctx.fillStyle = d.tipo === 'incognita' ? '#b9b2a2' : '#e3d5b0';
      ctx.fill(d.path);
    }
    const provs = Object.values(game.province);
    for (const p of provs) {
      ctx.fillStyle = provinceFill(game, p, modo, giocatore);
      ctx.fill(paths[p.id]);
      if (p.controller !== p.owner) {
        ctx.fillStyle = stripe(game.nazioni[p.controller].colore);
        ctx.fill(paths[p.id]);
      }
    }
    const lw = 1 / camera.scale;
    ctx.strokeStyle = 'rgba(43, 33, 24, 0.5)';
    ctx.lineWidth = 0.7 * lw;
    for (const p of provs) ctx.stroke(paths[p.id]);
    if (evidenzia) {
      ctx.strokeStyle = '#1b120a';
      ctx.lineWidth = 2.2 * lw;
      for (const p of provs) if (p.owner === evidenzia) ctx.stroke(paths[p.id]);
    }
    if (selezione.provincia) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5 * lw;
      ctx.stroke(paths[selezione.provincia]);
    }
    const sel = selezione.esercito && game.eserciti[selezione.esercito];
    if (sel && sel.percorso.length) {
      ctx.strokeStyle = '#8b1e1e';
      ctx.lineWidth = 2 * lw;
      ctx.setLineDash([6 * lw, 4 * lw]);
      ctx.beginPath();
      ctx.moveTo(...centri[sel.prov]);
      for (const id of sel.percorso) ctx.lineTo(...centri[id]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (camera.scale >= 1.6) {
      ctx.fillStyle = 'rgba(27, 18, 10, 0.75)';
      ctx.font = `${10 * lw}px Georgia`;
      ctx.textAlign = 'center';
      for (const p of provs) ctx.fillText(p.nome, centri[p.id][0], centri[p.id][1] - 6 * lw);
    }

    // eserciti in coordinate schermo, così restano leggibili a ogni zoom
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    markers = [];
    const perProv = {};
    for (const a of Object.values(game.eserciti)) (perProv[a.prov] ??= []).push(a);
    ctx.font = 'bold 11px Georgia';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const [prov, list] of Object.entries(perProv)) {
      const [cx, cy] = toScreen(camera, ...centri[prov]);
      list.forEach((a, i) => {
        const x = cx + (i - (list.length - 1) / 2) * 30, y = cy + 10;
        const men = a.fanteria + a.cavalleria;
        const scelto = a.id === selezione.esercito;
        ctx.fillStyle = game.nazioni[a.owner].colore;
        ctx.strokeStyle = scelto ? '#ffffff' : '#1b120a';
        ctx.lineWidth = scelto ? 3 : 1;
        ctx.beginPath();
        ctx.roundRect(x - 14, y - 8, 28, 16, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(men >= 1000 ? `${(men / 1000).toFixed(1)}k` : String(men), x, y + 0.5);
        if (a.inBattaglia) { ctx.fillStyle = '#b03a2e'; ctx.fillText('⚔', x + 19, y); }
        markers.push({ id: a.id, x, y });
      });
    }
    ctx.textBaseline = 'alphabetic';
  }

  return { resize, draw, markers: () => markers };
}
