// Genera public/img/rilievo.jpg: elevazione vera (terrain tiles AWS, zoom 8), ombreggiata e colorata in seppia,
// nella stessa proiezione della mappa. I tasselli restano in cache in data/dem/.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { makeProjection, W, H } from './projection.js';
import { lonLatToPixel, decodeTerrarium, hillshade, sepia } from './relief-lib.js';

const Z = 8, SCALA = 3, ESAGERAZIONE = 2.5;
const { anello } = JSON.parse(readFileSync(new URL('../data/confine.json', import.meta.url)));
const projection = makeProjection(anello);

const lons = anello.map(p => p[0]), lats = anello.map(p => p[1]);
const [x0, y0] = lonLatToPixel(Math.min(...lons) - 0.5, Math.max(...lats) + 0.5, Z).map(v => Math.floor(v / 256));
const [x1, y1] = lonLatToPixel(Math.max(...lons) + 0.5, Math.min(...lats) - 0.5, Z).map(v => Math.floor(v / 256));
const TW = x1 - x0 + 1, TH = y1 - y0 + 1;
console.log(`tasselli: ${TW}×${TH}`);

const dem = new Float32Array(TW * 256 * TH * 256);
for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
  const file = new URL(`../data/dem/${Z}/${tx}/${ty}.png`, import.meta.url);
  if (!existsSync(file)) {
    mkdirSync(new URL(`../data/dem/${Z}/${tx}/`, import.meta.url), { recursive: true });
    const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${Z}/${tx}/${ty}.png`);
    if (!r.ok) throw new Error(`tassello ${tx}/${ty}: ${r.status}`);
    writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  const png = PNG.sync.read(readFileSync(file));
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    dem[((ty - y0) * 256 + y) * TW * 256 + (tx - x0) * 256 + x] = Math.max(0, decodeTerrarium(png.data[i], png.data[i + 1], png.data[i + 2]));
  }
}

function quota(lon, lat) {
  const [px, py] = lonLatToPixel(lon, lat, Z);
  const x = px - x0 * 256, y = py - y0 * 256;
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = TW * 256, h = TH * 256;
  if (xi < 0 || yi < 0 || xi + 1 >= w || yi + 1 >= h) return 0;
  const a = dem[yi * w + xi], b = dem[yi * w + xi + 1], c = dem[(yi + 1) * w + xi], d = dem[(yi + 1) * w + xi + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

const OW = W * SCALA, OH = H * SCALA;
const q = new Float32Array(OW * OH);
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  const ll = projection.invert([(x + 0.5) / SCALA, (y + 0.5) / SCALA]);
  q[y * OW + x] = ll ? quota(ll[0], ll[1]) : 0;
}

// metri per pixel d'uscita, misurati al centro della mappa
const c = projection.invert([W / 2, H / 2]), c2 = projection.invert([W / 2 + 1 / SCALA, H / 2]);
const metri = (c2[0] - c[0]) * 111320 * Math.cos(c[1] * Math.PI / 180);
console.log(`${metri.toFixed(0)} m per pixel`);

const out = Buffer.alloc(OW * OH * 4);
for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) {
  const at = (xx, yy) => q[Math.min(OH - 1, Math.max(0, yy)) * OW + Math.min(OW - 1, Math.max(0, xx))];
  const dzdx = (at(x + 1, y) - at(x - 1, y)) / (2 * metri) * ESAGERAZIONE;
  const dzdy = (at(x, y + 1) - at(x, y - 1)) / (2 * metri) * ESAGERAZIONE;
  const [r, g, b] = sepia(q[y * OW + x], hillshade(dzdx, dzdy));
  const i = (y * OW + x) * 4;
  out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = 255;
}
mkdirSync(new URL('../public/img/', import.meta.url), { recursive: true });
writeFileSync(new URL('../public/img/rilievo.jpg', import.meta.url), jpeg.encode({ data: out, width: OW, height: OH }, 82).data);
console.log(`rilievo: ${OW}×${OH}`);
