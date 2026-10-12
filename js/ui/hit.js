// Cosa c'è sotto il mouse: una provincia (coordinate mappa) o un esercito (coordinate schermo).
import { pointInPolygon, bboxOf } from './geom.js';

export function buildIndex(map) {
  return map.province.map(p => ({ id: p.id, bbox: bboxOf(p.poligoni), poligoni: p.poligoni }));
}

export function provinceAt(index, wx, wy) {
  for (const e of index) {
    const [x0, y0, x1, y1] = e.bbox;
    if (wx < x0 || wx > x1 || wy < y0 || wy > y1) continue;
    if (e.poligoni.some(poly => pointInPolygon([wx, wy], poly))) return e.id;
  }
  return null;
}

export function armyAt(markers, sx, sy, radius = 12) {
  let best = null, bestDist = Infinity;
  for (const m of markers) {
    const d = Math.hypot(m.x - sx, m.y - sy);
    if (d <= radius && d < bestDist) { best = m.id; bestDist = d; }
  }
  return best;
}
