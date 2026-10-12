// Funzioni pure per costruire le province: Voronoi sui centri, tagliato sulla terra.
// Coordinate già proiettate (pixel). Poligono = [anello esterno, ...buchi]; multipoligono = [poligono, ...].
import { Delaunay } from 'd3-delaunay';
import polygonClipping from 'polygon-clipping';

export function ringArea(ring) {
  let s = 0;
  for (let i = 0; i < ring.length - 1; i++) s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return s / 2;
}

export function pointInRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentDistance(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function rdp(points, tol) {
  if (points.length < 3) return points;
  let max = 0, idx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = segmentDistance(points[i], points[0], points[points.length - 1]);
    if (d > max) { max = d; idx = i; }
  }
  if (max <= tol) return [points[0], points[points.length - 1]];
  return [...rdp(points.slice(0, idx + 1), tol).slice(0, -1), ...rdp(points.slice(idx), tol)];
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
  const a = rdp(open.slice(0, far + 1), tol);
  const b = rdp([...open.slice(far), open[0]], tol);
  return [...a.slice(0, -1), ...b];
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

export function buildProvinces({ pieces, centers, width, height }) {
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
      const poligoni = polygonClipping.intersection([voronoi.cellPolygon(k)], piece);
      if (!poligoni.length) throw new Error(`cella vuota per ${centers[i].id}`);
      cells[i] = { id: centers[i].id, poligoni, piece: p };
    });
  });
  return cells;
}

function bbox(multi) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const poly of multi) for (const [x, y] of poly[0]) {
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

// Confinano due celle sulla stessa terra che condividono un lato (almeno due vertici).
export function buildAdjacency(cells, { collegamenti, tagli }) {
  const adj = Object.fromEntries(cells.map(c => [c.id, new Set()]));
  const cut = new Set(tagli.map(([a, b]) => [a, b].sort().join('|')));
  const boxes = cells.map(c => bbox(c.poligoni));
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const c = cells[i], d = cells[j], a = boxes[i], b = boxes[j];
    if (c.piece !== d.piece || cut.has([c.id, d.id].sort().join('|'))) continue;
    if (a[0] > b[2] + 1 || b[0] > a[2] + 1 || a[1] > b[3] + 1 || b[1] > a[3] + 1) continue;
    if (sharedVertexCount(c.poligoni, d.poligoni, 0.5) >= 2) { adj[c.id].add(d.id); adj[d.id].add(c.id); }
  }
  for (const [a, b] of collegamenti) { adj[a].add(b); adj[b].add(a); }
  return Object.fromEntries(Object.entries(adj).map(([k, v]) => [k, [...v].sort()]));
}
