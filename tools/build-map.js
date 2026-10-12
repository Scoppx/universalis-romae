// Genera public/data/map.json da Natural Earth, data/confine.json e data/centri.json.
// Uso: npm run fetch-ne (una volta), poi npm run build-map.
import { readFileSync, writeFileSync } from 'node:fs';
import { geoConicConformal } from 'd3-geo';
import polygonClipping from 'polygon-clipping';
import { buildProvinces, buildAdjacency, simplifyRing, pointInRing, ringArea } from './geo.js';

const W = 1000, H = 1200, TOL = 0.6;
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));

const land = read('data/ne/ne_10m_land.geojson');
const { anello, incognita } = read('data/confine.json');
const { centri, collegamenti, tagli } = read('data/centri.json');

const landMulti = land.features.flatMap(f =>
  f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
const italy = polygonClipping.intersection(landMulti, [anello]);

// Si inquadra sui vertici dell'anello come punti: polygon-clipping produce anelli antiorari,
// che d3-geo leggerebbe come "tutto il globo tranne l'Italia".
const projection = geoConicConformal().parallels([38, 46]).rotate([-12.5, 0])
  .fitExtent([[20, 20], [W - 20, H - 20]], { type: 'MultiPoint', coordinates: anello });
const proj = ([lon, lat]) => projection([lon, lat]).map(v => Math.round(v * 10) / 10);

const projected = italy
  .map(poly => poly.map(ring => simplifyRing(ring.map(proj), TOL)))
  .filter(poly => poly[0].length >= 4 && Math.abs(ringArea(poly[0])) > 1);

const centers = centri.map(c => { const [x, y] = proj([c.lon, c.lat]); return { id: c.id, x, y }; });
const playable = projected.filter(poly => centers.some(c => pointInRing([c.x, c.y], poly[0])));
const incognitaPts = incognita.map(proj);
const decorazioni = projected
  .filter(poly => !playable.includes(poly))
  .map(poly => ({ tipo: incognitaPts.some(p => pointInRing(p, poly[0])) ? 'incognita' : 'isola', poligoni: [poly] }));

const cells = buildProvinces({ pieces: playable, centers, width: W, height: H });
const vicini = buildAdjacency(cells, { collegamenti, tagli });

const round = multi => multi.map(poly => poly.map(ring => ring.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])));
const map = {
  width: W, height: H,
  province: centri.map((c, i) => ({
    id: c.id, nome: c.nome, terreno: c.terreno, tasse: c.tasse, uomini: c.uomini, fort: c.fort,
    cultura: c.cultura, owner: c.owner, centro: [centers[i].x, centers[i].y],
    poligoni: round(cells[i].poligoni), vicini: vicini[c.id]
  })),
  stretti: collegamenti,
  decorazioni
};
writeFileSync(new URL('../public/data/map.json', import.meta.url), JSON.stringify(map));
const isolated = map.province.filter(p => p.vicini.length === 0).map(p => p.id);
console.log(`province: ${map.province.length}, decorazioni: ${decorazioni.length}, isolate: ${isolated.join(', ') || 'nessuna'}`);
