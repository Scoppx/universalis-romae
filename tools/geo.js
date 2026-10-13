// Funzioni pure per costruire le province: Voronoi sui centri, tagliato sulla terra.
// Coordinate già proiettate (pixel). Poligono = [anello esterno, ...buchi]; multipoligono = [poligono, ...].
import { Delaunay } from 'd3-delaunay';
import polygonClipping from 'polygon-clipping';
import { pointInRing, bboxOf } from '../public/js/ui/geom.js';

export { pointInRing };

export function ringArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return s / 2;
}

function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function simplifyLine(points, tol) {
  if (points.length < 3) return points;
  let max = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = segmentDistance(points[i], points[0], points[points.length - 1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [points[0], points[points.length - 1]];
  return [...simplifyLine(points.slice(0, idx + 1), tol).slice(0, -1), ...simplifyLine(points.slice(idx), tol)];
}

// Ramer-Douglas-Peucker su un anello chiuso: si divide in due metà dal punto più lontano dal primo.
export function simplifyRing(ring, tol) {
  const open = ring.slice(0, -1);
  if (open.length < 4) return ring;
  let far = 0, max = -1;
  for (let i = 1; i < open.length; i++) {
    const d = Math.hypot(open[i][0] - open[0][0], open[i][1] - open[0][1]);
    if (d > max) { max = d; far = i; }
  }
  const a = simplifyLine(open.slice(0, far + 1), tol);
  const b = simplifyLine([...open.slice(far), open[0]], tol);
  return [...a.slice(0, -1), ...b];
}

// Pseudo-caso deterministico in [-1, 1] da due numeri: lo stesso lato dà sempre la stessa linea.
function hash2(x, y, k) {
  let h = Math.imul(Math.round(x * 100) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(Math.round(y * 100) + k, 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return ((h >>> 0) / 4294967295) * 2 - 1;
}

// Lato spezzato con spostamenti del punto medio; costruito sempre dall'estremo "minore",
// così le due province vicine ricevono la stessa linea.
export function roughEdge(a, b, ampiezza, livelli = 3) {
  const swap = a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);
  const [p, q] = swap ? [b, a] : [a, b];
  let pts = [p, q];
  let amp = ampiezza * 0.5;
  for (let l = 0; l < livelli; l++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const off = hash2(mx, my, l) * amp * Math.hypot(q[0] - p[0], q[1] - p[1]) / 2 ** l;
      next.push(len ? [mx - (dy / len) * off, my + (dx / len) * off] : [mx, my], pts[i + 1]);
    }
    pts = next;
    amp *= 0.5;
  }
  return swap ? pts.reverse() : pts;
}

export function roughenRing(ring, ampiezza, [x0, y0, x1, y1]) {
  const onBorder = (a, b) => (a[0] === x0 && b[0] === x0) || (a[0] === x1 && b[0] === x1) ||
    (a[1] === y0 && b[1] === y0) || (a[1] === y1 && b[1] === y1);
  const out = [ring[0]];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1];
    out.push(...(onBorder(a, b) ? [b] : roughEdge(a, b, ampiezza).slice(1)));
  }
  return out;
}

// Tratti comuni di due multipoligoni: vertici di A che stanno anche in B, in sequenze di almeno due.
export function sharedBorder(multiA, multiB, tol) {
  const ptsB = multiB.flatMap(poly => poly.flatMap(r => r));
  const inB = p => ptsB.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol);
  const lines = [];
  for (const poly of multiA) for (const ring of poly) {
    const open = ring.slice(0, -1);
    const m = open.map(inB);
    if (m.every(Boolean) || !m.some(Boolean)) continue;
    const start = m.indexOf(false); // si parte da un vertice non condiviso, così le sequenze non si spezzano a cavallo
    let run = [];
    for (let k = 1; k <= open.length; k++) {
      const i = (start + k) % open.length;
      if (m[i]) run.push(open[i]);
      else { if (run.length >= 2) lines.push(run); run = []; }
    }
    if (run.length >= 2) lines.push(run);
  }
  return lines;
}

export function sharedVertexCount(multiA, multiB, tol) {
  const pts = multiB.flatMap(poly => poly.flatMap(r => r));
  const seen = [];
  for (const poly of multiA) for (const ring of poly) for (const p of ring) {
    if (seen.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol)) continue;
    if (pts.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) <= tol)) seen.push(p);
  }
  return seen.length;
}

export function buildProvinces({ pieces, centers, width, height, ruvidezza = 0 }) {
  const pieceOf = centers.map(c => {
    const i = pieces.findIndex(poly => pointInRing([c.x, c.y], poly[0]) && !poly.slice(1).some(h => pointInRing([c.x, c.y], h)));
    if (i < 0) throw new Error(`centro ${c.id} fuori dalla terra`);
    return i;
  });
  const cells = new Array(centers.length);
  // Voronoi separato per ogni terra: le celle coprono tutta la penisola o l'isola, senza buchi
  // lasciati da centri che stanno sull'altra sponda.
  pieces.forEach((piece, p) => {
    const idx = centers.map((_, i) => i).filter(i => pieceOf[i] === p);
    if (!idx.length) return;
    const voronoi = Delaunay.from(idx.map(i => [centers[i].x, centers[i].y])).voronoi([0, 0, width, height]);
    idx.forEach((i, k) => {
      const cella = voronoi.cellPolygon(k);
      const forma = ruvidezza > 0 ? roughenRing(cella, ruvidezza, [0, 0, width, height]) : cella;
      const poligoni = polygonClipping.intersection([forma], piece);
      if (!poligoni.length) throw new Error(`cella vuota per ${centers[i].id}`);
      cells[i] = { id: centers[i].id, poligoni, piece: p };
    });
  });
  return cells;
}

// Confinano due celle sulla stessa terra che condividono un lato (almeno due vertici).
export function buildAdjacency(cells, { collegamenti, tagli }) {
  const adj = Object.fromEntries(cells.map(c => [c.id, new Set()]));
  const cut = new Set(tagli.map(([a, b]) => [a, b].sort().join('|')));
  const boxes = cells.map(c => bboxOf(c.poligoni));
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const c = cells[i], d = cells[j], a = boxes[i], b = boxes[j];
    if (c.piece !== d.piece || cut.has([c.id, d.id].sort().join('|'))) continue;
    if (a[0] > b[2] + 1 || b[0] > a[2] + 1 || a[1] > b[3] + 1 || b[1] > a[3] + 1) continue;
    if (sharedVertexCount(c.poligoni, d.poligoni, 0.5) >= 2) { adj[c.id].add(d.id); adj[d.id].add(c.id); }
  }
  for (const [a, b] of collegamenti) { adj[a].add(b); adj[b].add(a); }
  return Object.fromEntries(Object.entries(adj).map(([k, v]) => [k, [...v].sort()]));
}
