import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { distanceKm } from './geo.js';
import { detourKm, scorePlace } from './scorePlace.js';

describe('scorePlace', () => {
  const ctx = { distanceKm: 0, effectiveRadiusKm: 10, categoryUses: 0 };
  it('lieu sur place, de catégorie nouvelle : très connu 85, certifié inconnu 70', () => {
    expect(scorePlace({ certified: true, category: 'museum', notoriety: 100 }, ctx, RULES)).toBe(85); // 45 + 10 + 30
    expect(scorePlace({ certified: true, category: 'museum' }, ctx, RULES)).toBe(70); // 45 + 15 + 10, notoriété inconnue
  });

  it('lieu connu : la notoriété compte, pas le label (bonus certifié réservé aux lieux peu connus)', () => {
    const near = { ...ctx, distanceKm: 1, effectiveRadiusKm: 3 };
    const famousGarden = scorePlace({ certified: false, category: 'park', notoriety: 56 }, near, RULES);
    const labelledPark = scorePlace({ certified: true, category: 'park', notoriety: 51 }, near, RULES);
    expect(famousGarden).toBeGreaterThan(labelledPark);
    expect(scorePlace({ certified: true, category: 'museum', notoriety: 10 }, ctx, RULES)).toBe(73); // 45 + 15 + 10 + 3
  });

  it('aucun bonus de notoriété au-delà du rayon effectif', () => {
    const far = { certified: false, category: 'park', notoriety: 90 };
    expect(scorePlace(far, { ...ctx, distanceKm: 12 }, RULES)).toBe(10); // diversité seule
  });

  it('fait passer un lieu très connu devant un lieu plus proche sans notoriété', () => {
    const near = scorePlace({ certified: true, category: 'monument', notoriety: 24 }, { ...ctx, distanceKm: 0.05, effectiveRadiusKm: 3 }, RULES);
    const famous = scorePlace({ certified: true, category: 'monument', notoriety: 97 }, { ...ctx, distanceKm: 0.26, effectiveRadiusKm: 3 }, RULES);
    expect(famous).toBeGreaterThan(near);
  });

  it('baisse avec la distance, jusqu\'au rayon effectif', () => {
    const place = { certified: false, category: 'park' };
    expect(scorePlace(place, { ...ctx, distanceKm: 5 }, RULES)).toBe(32.5); // 45 × 0,5 + 10
    expect(scorePlace(place, { ...ctx, distanceKm: 20 }, RULES)).toBe(10);
  });

  it('favorise la diversité des catégories', () => {
    const place = { certified: false, category: 'park' };
    expect(scorePlace(place, { ...ctx, categoryUses: 1 }, RULES)).toBe(50);
    expect(scorePlace(place, { ...ctx, categoryUses: 2 }, RULES)).toBe(47.5);
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
