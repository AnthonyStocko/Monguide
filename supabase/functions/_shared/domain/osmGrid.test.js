import { describe, expect, it } from 'vitest';
import { destinationPoint, distanceKm } from './geo.js';
import { cellIndex, formatTileId, parseTileId, tileBounds, tileIdForPoint, tileIdsForRadius } from './osmGrid.js';

const CELL = 0.2;

/** Cases des points du disque (centre, cercles concentriques tous les 0,5 km, 360 directions). */
function sampledTiles(lat, lon, radiusKm, cellDeg) {
  const ids = new Set([tileIdForPoint(lat, lon, cellDeg)]);
  for (let km = 0.5; km <= radiusKm; km += 0.5) {
    for (let bearing = 0; bearing < 360; bearing += 1) {
      const p = destinationPoint({ lat, lon }, km, bearing);
      ids.add(tileIdForPoint(p.lat, p.lon, cellDeg));
    }
  }
  return ids;
}

/** Distance du centre au point le plus proche de la case (maillage fin des bords). */
function minDistanceToTile(center, tileId, cellDeg) {
  const b = tileBounds(tileId, cellDeg);
  let best = Infinity;
  for (let i = 0; i <= 100; i++) {
    const lat = b.minLat + ((b.maxLat - b.minLat) * i) / 100;
    const lon = b.minLon + ((b.maxLon - b.minLon) * i) / 100;
    for (const p of [
      { lat, lon: b.minLon },
      { lat, lon: b.maxLon },
      { lat: b.minLat, lon },
      { lat: b.maxLat, lon }
    ]) {
      best = Math.min(best, distanceKm(center, p));
    }
  }
  return best;
}

describe('cellIndex', () => {
  it('utilise floor, pas une troncature, pour les valeurs négatives', () => {
    expect(cellIndex(-1.5, CELL)).toBe(-8);
    expect(cellIndex(-0.05, CELL)).toBe(-1);
    expect(cellIndex(-9.1, CELL)).toBe(-46);
    expect(cellIndex(1.5, CELL)).toBe(7);
  });

  it('range un point situé sur un bord dans la case au nord ou à l’est', () => {
    expect(cellIndex(45.6, CELL)).toBe(228); // 45.6 / 0.2 = 227.99999999999997
    expect(cellIndex(0, CELL)).toBe(0);
    expect(cellIndex(-0.2, CELL)).toBe(-1);
    expect(cellIndex(-0.4, CELL)).toBe(-2);
  });
});

describe('identifiants de case', () => {
  it('nomme la case "iy_ix"', () => {
    expect(tileIdForPoint(45.764, 4.8357, CELL)).toBe('228_24');
    expect(tileIdForPoint(48.4, -4.49, CELL)).toBe('242_-23'); // Brest
  });

  it('relit un identifiant, y compris négatif', () => {
    expect(parseTileId('242_-23')).toEqual({ iy: 242, ix: -23 });
    expect(parseTileId(formatTileId(-3, 7))).toEqual({ iy: -3, ix: 7 });
    expect(() => parseTileId('242,-23')).toThrow();
  });

  it('donne les limites de la case', () => {
    const b = tileBounds('242_-23', CELL);
    expect(b.minLat).toBeCloseTo(48.4, 10);
    expect(b.maxLat).toBeCloseTo(48.6, 10);
    expect(b.minLon).toBeCloseTo(-4.6, 10);
    expect(b.maxLon).toBeCloseTo(-4.4, 10);
  });
});

describe('tileIdsForRadius', () => {
  it('ne renvoie que la case du point, au centre d’une case, pour un petit rayon', () => {
    expect(tileIdsForRadius(45.7, 4.9, 2, CELL)).toEqual(['228_24']);
  });

  it('renvoie les 4 cases qui se touchent près d’un coin', () => {
    expect(tileIdsForRadius(45.601, 4.801, 1, CELL)).toEqual(['227_23', '227_24', '228_23', '228_24']);
  });

  it('couvre un rayon de 40 km : plus de cases en longitude qu’en latitude, coins écartés', () => {
    const ids = tileIdsForRadius(45.764, 4.8357, 40, CELL);
    const cells = ids.map(parseTileId);
    const rows = new Set(cells.map((c) => c.iy)).size;
    const cols = new Set(cells.map((c) => c.ix)).size;
    expect(rows).toBe(4); // 45,40° à 46,12° N
    expect(cols).toBeGreaterThan(rows); // 1° de longitude ≈ 78 km à 45° N, contre 111 km en latitude
    const rect = rows * cols;
    expect(ids.length).toBeLessThan(rect);
  });

  it.each([
    ['Lyon, 40 km', 45.764, 4.8357, 40],
    ['Paris, 20 km', 48.857, 2.352, 20],
    ['Brest (longitudes négatives), 30 km', 48.39, -4.486, 30],
    ['Lisbonne (longitudes négatives), 40 km', 38.722, -9.139, 40],
    ['Greenwich (longitude 0 dans le cercle), 25 km', 51.478, -0.001, 25],
    ['Laponie (degrés de longitude très étroits), 20 km', 68.35, 18.83, 20]
  ])('%s : exactement les cases qui touchent le cercle', (_, lat, lon, km) => {
    const ids = tileIdsForRadius(lat, lon, km, CELL);
    // Aucune case manquante : toute case contenant un point du disque est renvoyée.
    for (const id of sampledTiles(lat, lon, km, CELL)) expect(ids, id).toContain(id);
    // Aucune case de trop (au-delà de la marge de 0,1 %).
    for (const id of ids) expect(minDistanceToTile({ lat, lon }, id, CELL), id).toBeLessThanOrEqual(km * 1.001 + 0.01);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fonctionne avec un autre pas de grille', () => {
    expect(tileIdsForRadius(45.75, 4.85, 2, 0.1)).toEqual(['457_48']);
    expect(tileIdsForRadius(48.857, 2.352, 20, 0.1).length).toBe(29);
  });
});
