// Funzioni pure per il rilievo: tasselli di elevazione, ombreggiatura, tavolozza da carta antica.
export function lonLatToPixel(lon, lat, z) {
  const n = 256 * 2 ** z;
  const r = lat * Math.PI / 180;
  return [(lon + 180) / 360 * n, (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n];
}

export function decodeTerrarium(r, g, b) {
  return r * 256 + g + b / 256 - 32768;
}

// Ombreggiatura classica (luce da azimut e altezza dati); dz_dx verso est, dz_dy verso sud, in unità di quota/distanza.
export function hillshade(dzdx, dzdy, azimutGradi = 315, altezzaGradi = 45) {
  const zen = (90 - altezzaGradi) * Math.PI / 180;
  const az = (360 - azimutGradi + 90) * Math.PI / 180;
  const slope = Math.atan(Math.hypot(dzdx, dzdy));
  const aspect = Math.atan2(dzdy, -dzdx);
  const v = Math.cos(zen) * Math.cos(slope) + Math.sin(zen) * Math.sin(slope) * Math.cos(az - aspect);
  return Math.max(0, Math.min(1, v));
}

const STOPS = [ // quota in metri → colore carta antica
  [0, [236, 224, 196]], [300, [228, 211, 176]], [800, [214, 190, 148]],
  [1600, [196, 166, 122]], [2400, [222, 210, 190]], [3200, [244, 240, 232]]
];

export function sepia(quota, luce) {
  let i = 0;
  while (i < STOPS.length - 2 && quota > STOPS[i + 1][0]) i++;
  const [q0, c0] = STOPS[i], [q1, c1] = STOPS[i + 1];
  const t = Math.max(0, Math.min(1, (quota - q0) / (q1 - q0)));
  const f = 0.55 + 0.6 * luce; // la luce scurisce o schiarisce il colore di base
  return c0.map((c, k) => Math.max(0, Math.min(255, Math.round((c + (c1[k] - c) * t) * f))));
}
