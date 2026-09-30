import { describe, expect, it } from 'vitest';
import { RULES } from '../../supabase/functions/_shared/domain/config/rules.js';
import { generateTrip } from '../../supabase/functions/_shared/domain/generateTrip.js';
import { addDays, eachDate } from '../../supabase/functions/_shared/domain/dates.js';
import { EVAL_FIXTURES, fixturePlaces, fixtureWeather } from './fixtures.js';
import { degradation, median, summarize, travelMinutes, tripVariety, wishHints } from './metrics.js';

const baseTrip = (f) => ({
  schemaVersion: 2, id: f.id, title: f.destination.name, createdAt: 'x', updatedAt: 'x', deleted: false,
  destination: f.destination, timezone: f.timezone, currency: 'EUR', startDate: f.startDate,
  endDate: addDays(f.startDate, f.days - 1), travelers: 2, mode: f.mode,
  ...(f.mode === 'car' ? { fuelType: 'diesel' } : {}), profile: f.profile, lunch: f.lunch, dinner: 'restaurant',
  prefs: { vegetarian: false, wheelchair: false }, lodgings: [], days: [], candidates: []
});

describe('jeu d\'évaluation', () => {
  it('12 séjours types : villes et villages, France et étranger, profils, envies, pluie', () => {
    expect(EVAL_FIXTURES).toHaveLength(12);
    expect(new Set(EVAL_FIXTURES.map((f) => f.id)).size).toBe(12);
    expect(EVAL_FIXTURES.filter((f) => f.destination.countryCode !== 'FR').length).toBeGreaterThanOrEqual(5);
    expect(EVAL_FIXTURES.filter((f) => f.density < 0.5).length).toBeGreaterThanOrEqual(3);
    expect(new Set(EVAL_FIXTURES.map((f) => f.profile))).toEqual(new Set(['certified', 'balanced', 'explorer']));
    expect(EVAL_FIXTURES.filter((f) => f.wishes).length).toBeGreaterThanOrEqual(6);
    expect(EVAL_FIXTURES.filter((f) => f.rain).length).toBeGreaterThanOrEqual(3);
  });

  it('lieux déterministes et planning généré pour chaque séjour', () => {
    expect(fixturePlaces(EVAL_FIXTURES[0])).toEqual(fixturePlaces(EVAL_FIXTURES[0]));
    for (const f of EVAL_FIXTURES) {
      const trip = baseTrip(f);
      let seq = 0;
      const { trip: t } = generateTrip({ trip: trip, places: fixturePlaces(f), weatherDays: fixtureWeather(f, eachDate(trip.startDate, trip.endDate)), makeId: () => `s${(seq += 1)}` }, RULES);
      expect(t.days, f.id).toHaveLength(f.days);
      expect(t.days.flatMap((d) => d.steps).filter((s) => s.place).length, f.id).toBeGreaterThan(f.days * 2);
    }
  });
});

describe('mesures', () => {
  const day = (steps) => ({ date: '2026-10-06', steps });
  const s = (category, travel = 0, extra = {}) => ({ type: 'culture', travelFromPreviousMin: travel, place: { category, ...extra } });
  const trip = (days, mode = 'walk') => ({ mode, days });

  it('variété par journée, trajets totaux', () => {
    const t = trip([day([s('museum', 10), s('museum', 5), s('park', 20)]), day([s('viewpoint', 0)])]);
    expect(tripVariety(t)).toBe(1.5);
    t.days[0].departure = { travelMin: 7 };
    t.days[0].returnTravelMin = 8;
    expect(travelMinutes(t)).toBe(50);
  });

  it('indicateurs des envies (musées, nature, vin, marche, enfants)', () => {
    const before = trip([day([s('museum', 10), s('museum', 10), s('park', 10)])]);
    const after = trip([day([s('museum', 10), s('viewpoint', 10), s('park', 10)])]);
    expect(wishHints('Peu de musées', before, after)).toEqual([{ label: 'musées', before: 2, after: 1 }]);
    expect(wishHints('Plutôt nature, pas trop de marche', before, after).map((h) => [h.before, h.after])).toEqual([
      [1, 2],
      [30, 30]
    ]);
    expect(wishHints(undefined, before, after)).toEqual([]);
  });

  it('séjour dégradé : variété en baisse ou trajets nettement plus longs', () => {
    const before = trip([day([s('museum', 10), s('park', 10)])]);
    expect(degradation(before, trip([day([s('museum', 10), s('museum', 10)])]), RULES)).toContain('variété');
    expect(degradation(before, trip([day([s('museum', 10), s('park', 40)])]), RULES)).toContain('trajets');
  });

  it('médiane et bilan des seuils (rejets < 30 %, aucun séjour dégradé, médiane < 6 s)', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
    const rows = [
      { proposed: 4, rejected: 1, degraded: [], durationMs: 3000, status: 'applied' },
      { proposed: 2, rejected: 0, degraded: [], durationMs: 5000, status: 'unchanged' },
      { proposed: 0, rejected: 0, degraded: [], durationMs: 7000, status: 'applied' }
    ];
    expect(summarize(rows)).toMatchObject({ rejectedPct: 16.7, degraded: 0, medianMs: 5000, passes: { rejected: true, degraded: true, duration: true, answered: true } });
    expect(summarize([{ proposed: 3, rejected: 2, degraded: ['trajets'], durationMs: 9000, status: 'skipped' }]).passes).toEqual({ rejected: false, degraded: false, duration: false, answered: false });
  });
});
