// Proiezione unica della mappa (conica conforme centrata sull'Italia), condivisa da mappa e rilievo.
import { geoConicConformal } from 'd3-geo';

export const W = 1000, H = 1200;

// Si inquadra sui vertici dell'anello come punti: polygon-clipping produce anelli antiorari,
// che d3-geo leggerebbe come "tutto il globo tranne l'Italia".
export function makeProjection(anello) {
  return geoConicConformal().parallels([38, 46]).rotate([-12.5, 0])
    .fitExtent([[20, 20], [W - 20, H - 20]], { type: 'MultiPoint', coordinates: anello });
}
