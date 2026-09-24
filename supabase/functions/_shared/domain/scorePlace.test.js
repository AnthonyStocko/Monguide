import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { distanceKm } from './geo.js';
import { detourKm, scorePlace } from './scorePlace.js';

describe('scorePlace', () => {
  const ctx = { distanceKm: 0, effectiveRadiusKm: 10, categoryUses: 0 };
  it('vaut 100 pour un lieu certifié, sur place, de catégorie nouvelle', () => {
    expect(scorePlace({ certified: true, category: 'museum' }, ctx, RULES)).toBe(100);
  });

  it('baisse avec la distance, jusqu\'au rayon effectif', () => {
    const place = { certified: false, category: 'park' };
    expect(scorePlace(place, { ...ctx, distanceKm: 5 }, RULES)).toBe(45); // 60 × 0,5 + 15
    expect(scorePlace(place, { ...ctx, distanceKm: 20 }, RULES)).toBe(15);
  });

  it('favorise la diversité des catégories', () => {
    const place = { certified: false, category: 'park' };
    expect(scorePlace(place, { ...ctx, categoryUses: 1 }, RULES)).toBe(67.5);
    expect(scorePlace(place, { ...ctx, categoryUses: 2 }, RULES)).toBe(63.8);
  });
});

describe('detourKm', () => {
  it('est nul sur le trajet et grandit en s\'en éloignant', () => {
    const annecy = { lat: 45.8992, lon: 6.1294 };
    const chamonix = { lat: 45.9237, lon: 6.8694 };
    const onTheWay = { lat: 45.91, lon: 6.5 };
    const away = { lat: 45.6, lon: 6.5 };
    expect(detourKm(distanceKm, annecy, onTheWay, chamonix)).toBeLessThan(1);
    expect(detourKm(distanceKm, annecy, away, chamonix)).toBeGreaterThan(20);
  });
});
