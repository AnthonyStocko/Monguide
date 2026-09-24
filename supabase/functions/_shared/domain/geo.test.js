import { describe, expect, it } from 'vitest';
import { boundingBox, destinationPoint, distanceKm, roundCoord, samplePointsAround } from './geo.js';

const VILLEFRANCHE = { lat: 45.9865, lon: 4.7266 };
const LYON = { lat: 45.764, lon: 4.8357 };

describe('roundCoord', () => {
  it('arrondit à 2 décimales par défaut', () => {
    expect(roundCoord(48.856613)).toBe(48.86);
    expect(roundCoord(2.352222)).toBe(2.35);
    expect(roundCoord(-3.704379)).toBe(-3.7);
  });

  it('accepte une autre précision', () => {
    expect(roundCoord(48.856613, 4)).toBe(48.8566);
    expect(roundCoord(48.856613, 0)).toBe(49);
  });

  it('ne produit jamais -0', () => {
    expect(Object.is(roundCoord(-0.001), 0)).toBe(true);
  });
});

describe('distanceKm', () => {
  it('calcule la distance Villefranche-Lyon (≈ 26 km)', () => {
    expect(distanceKm(VILLEFRANCHE, LYON)).toBeCloseTo(26, 0);
  });

  it('est nulle entre un point et lui-même, et symétrique', () => {
    expect(distanceKm(LYON, LYON)).toBe(0);
    expect(distanceKm(LYON, VILLEFRANCHE)).toBeCloseTo(distanceKm(VILLEFRANCHE, LYON), 10);
  });
});

describe('destinationPoint / samplePointsAround', () => {
  it('place un point à la distance et dans la direction demandées', () => {
    const north = destinationPoint(VILLEFRANCHE, 20, 0);
    expect(distanceKm(VILLEFRANCHE, north)).toBeCloseTo(20, 5);
    expect(north.lat).toBeGreaterThan(VILLEFRANCHE.lat);
    expect(north.lon).toBeCloseTo(VILLEFRANCHE.lon, 6);
  });

  it('renvoie le centre et les points du cercle', () => {
    const points = samplePointsAround(VILLEFRANCHE, 20, 8);
    expect(points).toHaveLength(9);
    expect(points[0]).toEqual(VILLEFRANCHE);
    for (const p of points.slice(1)) expect(distanceKm(VILLEFRANCHE, p)).toBeCloseTo(20, 5);
  });
});

describe('boundingBox', () => {
  it('englobe le cercle', () => {
    const box = boundingBox(VILLEFRANCHE, 20);
    for (const bearing of [0, 90, 180, 270]) {
      const p = destinationPoint(VILLEFRANCHE, 20, bearing);
      expect(p.lat).toBeGreaterThanOrEqual(box.minLat - 1e-9);
      expect(p.lat).toBeLessThanOrEqual(box.maxLat + 1e-9);
      expect(p.lon).toBeGreaterThanOrEqual(box.minLon - 1e-9);
      expect(p.lon).toBeLessThanOrEqual(box.maxLon + 1e-9);
    }
  });
});
