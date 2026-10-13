// Genera public/data/map.json da Natural Earth, data/confine.json e data/centri.json.
// Uso: npm run fetch-ne (una volta), poi npm run build-map.
import { readFileSync, writeFileSync } from 'node:fs';
import { makeProjection, W, H } from './projection.js';
import polygonClipping from 'polygon-clipping';
import { buildProvinces, buildAdjacency, simplifyRing, pointInRing, ringArea, sharedBorder, simplifyLine } from './geo.js';

const TOL = 0.6, RUVIDEZZA = 0.12;
const read = p => JSON.parse(readFileSync(new URL(`../${p}`, import.meta.url)));

const land = read('data/ne/ne_10m_land.geojson');
const { anello, incognita } = read('data/confine.json');
const { centri, collegamenti, tagli } = read('data/centri.json');

const landMulti = land.features.flatMap(f =>
  f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates);
const italy = polygonClipping.intersection(landMulti, [anello]);

const projection = makeProjection(anello);
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

const cells = buildProvinces({ pieces: playable, centers, width: W, height: H, ruvidezza: RUVIDEZZA });
const vicini = buildAdjacency(cells, { collegamenti, tagli });

const round = multi => multi.map(poly => poly.map(ring => ring.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])));
// Fiumi e laghi veri: si tengono i tratti dentro l'anello, proiettati e semplificati.
const fiumiGeo = ['ne_10m_rivers_lake_centerlines', 'ne_10m_rivers_europe'].flatMap(f => read(`data/ne/${f}.geojson`).features);
const dentro = ([lon, lat]) => pointInRing([lon, lat], anello);
const fiumi = [];
for (const f of fiumiGeo) {
  if (!f.geometry) continue;
  const linee = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [];
  for (const linea of linee) {
    let tratto = [];
    const chiudi = () => {
      if (tratto.length >= 2) {
        const punti = simplifyLine(tratto.map(proj), 0.4);
        if (punti.length >= 2) fiumi.push({ nome: f.properties.name ?? '', rank: f.properties.scalerank ?? 10, punti });
      }
      tratto = [];
    };
    for (const p of linea) { if (dentro(p)) tratto.push(p); else chiudi(); }
    chiudi();
  }
}
const laghi = ['ne_10m_lakes', 'ne_10m_lakes_europe']
  .flatMap(f => read(`data/ne/${f}.geojson`).features)
  .filter(f => f.geometry)
  .flatMap(f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates))
  .filter(poly => dentro(poly[0][0]))
  .map(poly => poly.map(ring => simplifyRing(ring.map(proj), 0.4)))
  .filter(poly => poly[0].length >= 4 && Math.abs(ringArea(poly[0])) > 2);

// Confini condivisi fra province vicine (non gli stretti), per disegnarli a parte.
const confini = [];
cells.forEach((c, i) => {
  for (const v of vicini[c.id]) {
    const j = cells.findIndex(d => d.id === v);
    if (j <= i || c.piece !== cells[j].piece) continue;
    for (const punti of sharedBorder(c.poligoni, cells[j].poligoni, 0.5)) confini.push({ a: c.id, b: v, punti: round([[punti]])[0][0] });
  }
});

const map = {
  width: W, height: H,
  province: centri.map((c, i) => ({
    id: c.id, nome: c.nome, terreno: c.terreno, tasse: c.tasse, uomini: c.uomini, fort: c.fort,
    cultura: c.cultura, owner: c.owner, centro: [centers[i].x, centers[i].y],
    poligoni: round(cells[i].poligoni), vicini: vicini[c.id]
  })),
  stretti: collegamenti,
  decorazioni,
  fiumi,
  laghi,
  confini
};
writeFileSync(new URL('../public/data/map.json', import.meta.url), JSON.stringify(map));
const isolated = map.province.filter(p => p.vicini.length === 0).map(p => p.id);
console.log(`province: ${map.province.length}, decorazioni: ${decorazioni.length}, isolate: ${isolated.join(', ') || 'nessuna'}, fiumi: ${fiumi.length}, laghi: ${laghi.length}, confini: ${confini.length}`);
