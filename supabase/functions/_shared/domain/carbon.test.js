import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { computeCarbon, computeFuelCost, emissionsKg } from './carbon.js';

const FACTORS = { car: { sp95: 2.69, diesel: 3.1 }, transitKgPerPkm: 0.05 };
const opts = { travelers: 2, fuelType: 'diesel', consumptionL100: 6.5 };

describe('carbon', () => {
  it('calcule les émissions des 4 modes', () => {
    expect(emissionsKg(100, 'car', FACTORS, opts)).toBeCloseTo(20.15, 5); // 6,5 L × 3,1
    expect(emissionsKg(100, 'transit', FACTORS, opts)).toBeCloseTo(10, 5); // 100 × 0,05 × 2 voyageurs
    expect(emissionsKg(100, 'walk', FACTORS, opts)).toBe(0);
    expect(emissionsKg(100, 'bike', FACTORS, opts)).toBe(0);
  });

  it('fait le bilan par jour et compare les modes', () => {
    const carbon = computeCarbon([[10, 20], [30]], { mode: 'transit', travelers: 1 }, FACTORS, RULES);
    expect(carbon).toEqual({ totalKgCo2e: 3, byDay: [1.5, 1.5], byMode: { walk: 0, transit: 3, bike: 0, car: 10.491 }, distanceKm: 60 });
  });

  it('garde la précision au gramme pour les trajets courts', () => {
    const carbon = computeCarbon([[0.5]], { mode: 'transit', travelers: 2 }, { ...FACTORS, transitKgPerPkm: 0.00503 }, RULES);
    expect(carbon.totalKgCo2e).toBe(0.005);
  });

  it('sans facteurs : pas de bilan', () => {
    expect(computeCarbon([[10]], { mode: 'car', travelers: 1 }, null, RULES)).toBeUndefined();
  });

  it('coût carburant avec la consommation par défaut ou celle du séjour', () => {
    const fuel = { currency: 'PLN', prices: { diesel: { average: 5.554 } } };
    expect(computeFuelCost(100, { fuelType: 'diesel' }, fuel, RULES)).toEqual({ amount: 36.1, currency: 'PLN' });
    expect(computeFuelCost(100, { fuelType: 'diesel', fuelConsumption: 5 }, fuel, RULES)).toEqual({ amount: 27.77, currency: 'PLN' });
    expect(computeFuelCost(100, { fuelType: 'lpg' }, fuel, RULES)).toBeUndefined();
  });
});
