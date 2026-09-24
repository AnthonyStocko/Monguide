import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { checkSlotTiming } from './checkSlotTiming.js';
import { destinationPoint } from './geo.js';

const HOME = { lat: 45.99, lon: 4.72 };
const museum = { id: 'm', name: 'Musée', category: 'museum', ...HOME, indoor: true };
const park = { id: 'p', name: 'Parc', category: 'park', ...destinationPoint(HOME, 1, 90), indoor: false };
const restaurant = { id: 'r', name: 'Le Bouchon', category: 'restaurant', ...destinationPoint(HOME, 0.5, 0), indoor: true, food: { regional: false, openingHours: 'Mo-Su 12:00-14:00' } };

const day = (steps, weather) => ({ date: '2026-10-06', weatherAvailable: Boolean(weather), ...(weather ? { weather } : {}), steps });
const step = (id, type, place, start, end) => ({ id, type, place, start, end, badges: [] });
const check = (d, index, start, end, mode = 'walk') => checkSlotTiming({ day: d, index, start, end, mode, countryCode: 'FR' }, RULES);
const codes = (r) => r.warnings.map((w) => w.code);

describe('checkSlotTiming', () => {
  const plan = day([step('a', 'culture', museum, '10:00', '11:30'), step('b', 'lunch', restaurant, '12:30', '13:45'), step('c', 'outdoor', park, '14:30', '16:00')]);

  it('musée de 40 min : TOO_SHORT', () => {
    const r = check(plan, 0, '10:00', '10:40');
    expect(r.warnings).toEqual([{ code: 'TOO_SHORT', activity: 'museum', minimumMin: 60, durationMin: 40 }]);
    expect(r.blocking).toBe(false);
  });

  it('musée de 75 min : aucun avertissement, simple indication (sous les 90 min conseillées)', () => {
    const r = check(plan, 0, '10:00', '11:15');
    expect(r.warnings).toEqual([]);
    expect(r.belowRecommended).toBe(true);
  });

  it('début avant la fin du trajet depuis l\'étape précédente : OVERLAP_PREVIOUS', () => {
    // Restaurant à 0,5 km du musée : 8 min à pied ; le musée finit à 11:30.
    const r = check(day([step('a', 'culture', museum, '10:00', '11:30'), step('b', 'lunch', restaurant, '12:30', '13:45')]), 1, '11:35', '12:50');
    expect(r.warnings).toContainEqual({ code: 'OVERLAP_PREVIOUS', travelMin: 8, previousEnd: '11:30', mode: 'walk' });
  });

  it('fin trop tardive pour rejoindre l\'étape suivante : OVERLAP_NEXT', () => {
    expect(codes(check(plan, 0, '10:00', '12:28'))).toContain('OVERLAP_NEXT');
  });

  it('restaurant réglé à 14h30 alors qu\'il ferme à 14h00 : CLOSED', () => {
    const r = check(day([step('b', 'lunch', restaurant, '12:30', '13:45')]), 0, '14:30', '15:45');
    expect(r.warnings).toContainEqual({ code: 'CLOSED', openingHours: 'Mo-Su 12:00-14:00' });
    expect(codes(check(day([step('b', 'lunch', restaurant, '12:30', '13:45')]), 0, '12:30', '13:45'))).toEqual([]);
  });

  it('fin avant le début : INVALID, enregistrement impossible', () => {
    const r = check(plan, 0, '11:00', '10:30');
    expect(r).toMatchObject({ warnings: [{ code: 'INVALID' }], blocking: true });
    expect(check(plan, 0, '11:00', '11:00').blocking).toBe(true);
  });

  it('activité extérieure sous plus de 50 % de pluie : RAIN', () => {
    const weather = { 14: 70, 15: 90, 16: 20 };
    expect(check(day([step('c', 'outdoor', park, '14:30', '16:00')], weather), 0, '14:30', '16:00').warnings).toContainEqual({ code: 'RAIN', pct: 80 });
    expect(codes(check(day([step('a', 'culture', museum, '14:30', '16:00')], weather), 0, '14:30', '16:00'))).not.toContain('RAIN');
  });

  it('fin après 21h00 : LATE', () => {
    expect(codes(check(day([step('c', 'relax', park, '19:30', '20:30')]), 0, '20:00', '21:30'))).toContain('LATE');
  });
});
