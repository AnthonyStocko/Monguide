const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

/**
 * Arrondit une coordonnée (degrés). 2 décimales ≈ 1 km : précision utilisée
 * pour les clés de cache et les journaux, qui ne conservent jamais de
 * position exacte.
 * @param {number} value
 * @param {number} [decimals]
 * @returns {number}
 */
export function roundCoord(value, decimals = 2) {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Distance à vol d'oiseau (formule de haversine).
 * @param {{ lat: number, lon: number }} a
 * @param {{ lat: number, lon: number }} b
 * @returns {number} kilomètres
 */
export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Point atteint depuis `origin` en parcourant `km` dans la direction `bearingDeg`.
 * @param {{ lat: number, lon: number }} origin
 * @param {number} km
 * @param {number} bearingDeg 0 = nord, 90 = est
 */
export function destinationPoint(origin, km, bearingDeg) {
  const d = km / EARTH_RADIUS_KM;
  const b = toRad(bearingDeg);
  const lat1 = toRad(origin.lat);
  const lon1 = toRad(origin.lon);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lon2 = lon1 + Math.atan2(Math.sin(b) * Math.sin(d) * Math.cos(lat1), Math.cos(d) - Math.sin(lat1) * Math.sin(lat2));
  return { lat: toDeg(lat2), lon: ((toDeg(lon2) + 540) % 360) - 180 };
}

/**
 * Centre + `count` points répartis sur le cercle de rayon `km` : sert à
 * repérer les zones administratives (départements…) touchées par le cercle.
 * @param {{ lat: number, lon: number }} center
 * @param {number} km
 * @param {number} [count]
 */
export function samplePointsAround(center, km, count = 8) {
  const ring = Array.from({ length: count }, (_, i) => destinationPoint(center, km, (360 / count) * i));
  return [center, ...ring];
}

/**
 * Rectangle englobant le cercle (pour filtrer une source par intervalle).
 * @param {{ lat: number, lon: number }} center
 * @param {number} km
 */
export function boundingBox(center, km) {
  const dLat = toDeg(km / EARTH_RADIUS_KM);
  const dLon = toDeg(km / (EARTH_RADIUS_KM * Math.cos(toRad(center.lat))));
  return { minLat: center.lat - dLat, maxLat: center.lat + dLat, minLon: center.lon - dLon, maxLon: center.lon + dLon };
}
