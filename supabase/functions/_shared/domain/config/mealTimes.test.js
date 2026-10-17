import { describe, expect, it } from 'vitest';
import { COUNTRY_MEAL_TIMES, DEFAULT_MEAL_TIMES, mealTimesFor } from './mealTimes.js';
import { RULES } from './rules.js';
import { SUPPORTED_COUNTRIES } from './countries.js';

describe('mealTimesFor', () => {
  it('valeurs par défaut = celles d’avant (gabarit, plage du déjeuner, durée du restaurant), reprises par rules.js', () => {
    const fr = mealTimesFor('FR', RULES);
    expect(fr).toEqual({
      lunch: { start: '12:30', window: { start: '12:30', end: '14:00' }, durationMin: 75 },
      dinner: { start: '19:30', earliest: '19:00' },
      visits: { relax: '17:30' }
    });
    expect(mealTimesFor('XX', RULES)).toEqual(fr);
    expect(mealTimesFor(undefined, RULES)).toEqual(fr);
    expect(RULES.dayTemplate).toMatchObject({ lunch: DEFAULT_MEAL_TIMES.lunch.start, dinner: DEFAULT_MEAL_TIMES.dinner.start, relax: DEFAULT_MEAL_TIMES.visits.relax });
    expect(RULES.lunchWindow).toEqual(DEFAULT_MEAL_TIMES.lunch.window);
    expect(RULES.durations.restaurant.recommendedMin).toBe(DEFAULT_MEAL_TIMES.lunch.durationMin);
  });

  it('Espagne : déjeuner entre 13:30 et 14:30 pendant 1 h 15, dîner pas avant 20:30, dernière visite plus tardive', () => {
    expect(mealTimesFor('es', RULES)).toEqual({
      lunch: { start: '14:00', window: { start: '13:30', end: '14:30' }, durationMin: 75 },
      dinner: { start: '21:00', earliest: '20:30' },
      visits: { relax: '18:30' }
    });
  });

  it('Grèce, Italie, Portugal : horaires d’avant inchangés', () => {
    expect(mealTimesFor('GR', RULES)).toMatchObject({ lunch: { start: '14:00', window: { start: '14:00', end: '15:30' } }, dinner: { start: '21:00' }, visits: { relax: '17:30' } });
    expect(mealTimesFor('IT', RULES)).toMatchObject({ lunch: { start: '12:30' }, dinner: { start: '20:00' } });
    expect(mealTimesFor('PT', RULES)).toMatchObject({ lunch: { start: '12:30' }, dinner: { start: '20:00' } });
  });

  it('le dîner ne commence jamais avant l’heure minimale du pays', () => {
    const early = { ...RULES, dayTemplate: { ...RULES.dayTemplate, dinner: '18:00' } };
    expect(mealTimesFor('FR', early).dinner.start).toBe('19:00');
    expect(mealTimesFor('ES', early).dinner.start).toBe('21:00');
  });

  it('pays connus, heures "HH:mm" valides', () => {
    for (const [code, times] of Object.entries(COUNTRY_MEAL_TIMES)) {
      expect(SUPPORTED_COUNTRIES[code], code).toBeDefined();
      const t = mealTimesFor(code, RULES);
      for (const v of [t.lunch.start, t.lunch.window.start, t.lunch.window.end, t.dinner.start, t.dinner.earliest, t.visits.relax]) expect(v, code).toMatch(/^\d{2}:\d{2}$/);
      expect(t.lunch.window.start <= t.lunch.start && t.lunch.start <= t.lunch.window.end, code).toBe(true);
      expect(times).toBeTypeOf('object');
    }
  });
});
