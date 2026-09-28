import { COUNTRY_SHAPES } from './config/countryShapes.js';

/**
 * Pays touchés par un cercle de recherche, d'après les contours approximatifs
 * des extraits Geofabrik (config/countryShapes.js) : sert à signaler une
 * couverture partielle des lieux OSM (pays pris en charge, pas encore importé).
 * Les contours débordent des frontières de quelques kilomètres : un cercle qui
 * s'arrête juste avant une frontière peut toucher le pays voisin (À VÉRIFIER).
 */

const KM_PER_DEG_LAT = 110.574;
const KM_PER_DEG_LON_EQUATOR = 111.32;

/** Projection plane locale (km) autour du centre du cercle. */
function projector(center) {
  const kx = KM_PER_DEG_LON_EQUATOR * Math.cos((center.lat * Math.PI) / 180);
  return ([lon, lat]) => [(lon - center.lon) * kx, (lat - center.lat) * KM_PER_DEG_LAT];
}

/** Distance de l'origine au segment [a, b] (plan). */
function originToSegment([ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

/**
 * Le cercle (centre à l'origine après projection) touche-t-il le polygone ?
 * Centre à l'intérieur (pair-impair sur tous les anneaux, trous compris), ou
 * un bord à moins de radiusKm.
 * @param {[number, number][][]} rings
 */
function circleTouchesPolygon(rings, project, radiusKm) {
  let inside = false;
  for (const ring of rings) {
    const pts = ring.map(project);
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (yi > 0 !== yj > 0 && 0 < ((xj - xi) * -yi) / (yj - yi) + xi) inside = !inside;
      if (originToSegment(pts[j], pts[i]) <= radiusKm) return true;
    }
  }
  return inside;
}

/**
 * Codes des pays pris en charge dont le contour touche le cercle, triés.
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {Readonly<Record<string, { bbox: number[], polygons: [number, number][][][] }>>} [shapes]
 * @returns {string[]}
 */
export function countriesInCircle(point, radiusKm, shapes = COUNTRY_SHAPES) {
  const project = projector(point);
  const dLat = radiusKm / KM_PER_DEG_LAT;
  const dLon = radiusKm / (KM_PER_DEG_LON_EQUATOR * Math.max(Math.cos((point.lat * Math.PI) / 180), 0.01));
  const out = [];
  for (const [code, shape] of Object.entries(shapes)) {
    const [minLon, minLat, maxLon, maxLat] = shape.bbox;
    if (point.lon + dLon < minLon || point.lon - dLon > maxLon || point.lat + dLat < minLat || point.lat - dLat > maxLat) continue;
    if (shape.polygons.some((rings) => circleTouchesPolygon(rings, project, radiusKm))) out.push(code);
  }
  return out.sort();
}
