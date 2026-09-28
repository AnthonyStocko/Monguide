/**
 * Simplification des contours des extraits Geofabrik (scripts/country-shapes/build.js).
 */

/** Tolérance de simplification : 0,01°, environ 1 km. */
export const TOLERANCE_DEG = 0.01;

/** Distance d'un point au segment [a, b] (en degrés, plan). */
function segmentDistance([px, py], [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * Douglas-Peucker sur un anneau fermé (premier point = dernier point).
 * @param {[number, number][]} ring
 * @param {number} tolerance
 * @returns {[number, number][]}
 */
export function simplifyRing(ring, tolerance) {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  // Anneau fermé : on coupe au point le plus éloigné du premier.
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < ring.length - 1; i += 1) {
    const d = Math.hypot(ring[i][0] - ring[0][0], ring[i][1] - ring[0][1]);
    if (d > farDist) [far, farDist] = [i, d];
  }
  keep[far] = 1;
  const stack = [
    [0, far],
    [far, ring.length - 1]
  ];
  while (stack.length) {
    const [a, b] = stack.pop();
    let index = -1;
    let max = tolerance;
    for (let i = a + 1; i < b; i += 1) {
      const d = segmentDistance(ring[i], ring[a], ring[b]);
      if (d > max) [index, max] = [i, d];
    }
    if (index >= 0) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return ring.filter((_, i) => keep[i]);
}

const round = (v) => Math.round(v * 1000) / 1000;

/** Polygones simplifiés et rectangle englobant d'une géométrie GeoJSON (Polygon ou MultiPolygon). */
export function simplifyGeometry(geometry, tolerance = TOLERANCE_DEG) {
  const polygons = (geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates).map((rings) =>
    rings.map((ring) => simplifyRing(ring, tolerance).map(([lon, lat]) => [round(lon), round(lat)])).filter((ring) => ring.length >= 4)
  );
  const points = polygons.flat(2);
  const lons = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  return { bbox: [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)], polygons };
}
