import { describe, expect, it } from 'vitest';
import { pointOnSurface } from './pointOnSurface.js';

/** Point dans le polygone (règle pair-impair, trous compris). */
function inside([x, y], rings) {
  let isIn = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) isIn = !isIn;
    }
  }
  return isIn;
}

const square = (x, y, s) => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
  [x, y]
];

describe('pointOnSurface', () => {
  it('renvoie le point lui-même', () => {
    expect(pointOnSurface({ type: 'Point', coordinates: [4.8, 45.7] })).toEqual([4.8, 45.7]);
  });

  it('place le point au milieu d’un carré', () => {
    const p = pointOnSurface({ type: 'Polygon', coordinates: [square(0, 0, 2)] });
    expect(p[0]).toBeCloseTo(1, 10);
    expect(p[1]).toBeCloseTo(1, 10);
  });

  it('reste dans un polygone en U, dont le centre du rectangle englobant est dehors', () => {
    const u = [
      [0, 0],
      [3, 0],
      [3, 3],
      [2, 3],
      [2, 1],
      [1, 1],
      [1, 3],
      [0, 3],
      [0, 0]
    ];
    const p = pointOnSurface({ type: 'Polygon', coordinates: [u] });
    expect(inside([1.5, 1.5], [u])).toBe(false); // centre du rectangle englobant : dehors
    expect(inside(p, [u])).toBe(true);
  });

  it('reste dans un croissant, dont le centroïde est dehors', () => {
    const outer = [];
    const n = 64;
    for (let i = 0; i <= n; i++) outer.push([Math.cos((Math.PI * i) / n) * 2, Math.sin((Math.PI * i) / n) * 2]);
    for (let i = n; i >= 0; i--) outer.push([Math.cos((Math.PI * i) / n) * 1.5, Math.sin((Math.PI * i) / n) * 1.5]);
    outer.push(outer[0]);
    const p = pointOnSurface({ type: 'Polygon', coordinates: [outer] });
    expect(inside(p, [outer])).toBe(true);
  });

  it('évite un trou central', () => {
    const rings = [square(0, 0, 10), square(2, 2, 6)];
    const p = pointOnSurface({ type: 'Polygon', coordinates: rings });
    expect(inside(p, rings)).toBe(true);
  });

  it('choisit la plus grande partie d’un multipolygone, et reste dedans', () => {
    const small = [square(0, 0, 1)];
    const big = [square(10, 10, 5)];
    const p = pointOnSurface({ type: 'MultiPolygon', coordinates: [small, big] });
    expect(inside(p, big)).toBe(true);
  });

  it('place un point à mi-longueur d’une ligne', () => {
    const p = pointOnSurface({
      type: 'LineString',
      coordinates: [
        [0, 0],
        [4, 0],
        [4, 2]
      ]
    });
    expect(p).toEqual([3, 0]);
  });

  it('renvoie un sommet pour un polygone plat, null pour une géométrie inconnue', () => {
    const flat = [
      [1, 1],
      [2, 1],
      [3, 1],
      [1, 1]
    ];
    expect(pointOnSurface({ type: 'Polygon', coordinates: [flat] })).toEqual([1, 1]);
    expect(pointOnSurface({ type: 'GeometryCollection', geometries: [] })).toBeNull();
    expect(pointOnSurface(null)).toBeNull();
  });

  it('est déterministe', () => {
    const g = { type: 'Polygon', coordinates: [square(4.8, 45.7, 0.013)] };
    expect(pointOnSurface(g)).toEqual(pointOnSurface(structuredClone(g)));
  });
});
