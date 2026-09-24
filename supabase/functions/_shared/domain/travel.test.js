import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { destinationPoint } from './geo.js';
import { effectiveRadiusKm, routeKm, travelMinutes } from './travel.js';

const A = { lat: 45.99, lon: 4.72 };
const B = destinationPoint(A, 10, 90); // 10 km à l'est

describe('paramètres des 4 modes', () => {
  it('donne le rayon effectif de chaque mode, sans dépasser le rayon choisi', () => {
    expect(effectiveRadiusKm('walk', 20, RULES)).toBe(3);
    expect(effectiveRadiusKm('transit', 40, RULES)).toBe(20);
    expect(effectiveRadiusKm('bike', 40, RULES)).toBe(15);
    expect(effectiveRadiusKm('car', 40, RULES)).toBe(40);
    expect(effectiveRadiusKm('transit', 10, RULES)).toBe(10);
  });

  it('estime les trajets : distance × 1,3 / vitesse du mode', () => {
    expect(routeKm(A, B, RULES)).toBeCloseTo(13, 5);
    expect(travelMinutes(A, B, 'walk', RULES)).toBe(156); // 13 km à 5 km/h
    expect(travelMinutes(A, B, 'transit', RULES)).toBe(39); // 13 km à 20 km/h
    expect(travelMinutes(A, B, 'bike', RULES)).toBe(52); // 13 km à 15 km/h
    expect(travelMinutes(A, B, 'car', RULES)).toBe(16); // 13 km à 50 km/h
    expect(travelMinutes(A, A, 'car', RULES)).toBe(0);
  });
});
