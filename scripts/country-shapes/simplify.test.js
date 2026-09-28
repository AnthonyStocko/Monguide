import { describe, expect, it } from 'vitest';
import { simplifyGeometry, simplifyRing } from './simplify.js';

describe('simplifyRing', () => {
  it('retire les points presque alignés, garde les angles et la fermeture', () => {
    const ring = [
      [0, 0],
      [0.5, 0.001],
      [1, 0],
      [1, 1],
      [0.5, 0.999],
      [0, 1],
      [0, 0]
    ];
    expect(simplifyRing(ring, 0.01)).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0]
    ]);
  });

  it('garde un point qui s’écarte de plus que la tolérance', () => {
    const ring = [
      [0, 0],
      [0.5, 0.2],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0]
    ];
    expect(simplifyRing(ring, 0.01)).toContainEqual([0.5, 0.2]);
  });
});

describe('simplifyGeometry', () => {
  it('Polygon ou MultiPolygon : polygones arrondis à 0,001° et rectangle englobant', () => {
    const square = [
      [
        [0.00011, 0],
        [2, 0],
        [2, 1.23456],
        [0, 1.23456],
        [0.00011, 0]
      ]
    ];
    expect(simplifyGeometry({ type: 'Polygon', coordinates: square })).toEqual({
      bbox: [0, 0, 2, 1.235],
      polygons: [
        [
          [
            [0, 0],
            [2, 0],
            [2, 1.235],
            [0, 1.235],
            [0, 0]
          ]
        ]
      ]
    });
    expect(simplifyGeometry({ type: 'MultiPolygon', coordinates: [square, square] }).polygons).toHaveLength(2);
  });
});
