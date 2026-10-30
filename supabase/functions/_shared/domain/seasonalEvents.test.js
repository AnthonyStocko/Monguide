import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { destinationPoint } from './geo.js';
import { generateTrip } from './generateTrip.js';
import { eventActiveOn, eventsForTrip, eventToPlace } from './seasonalEvents.js';
import { toMinutes } from './time.js';

const BRUSSELS = { lat: 50.8467, lon: 4.3525 };
const row = (extra = {}) => ({
  id: 'plaisirs',
  name: "Plaisirs d'Hiver",
  city: 'Bruxelles',
  ...destinationPoint(BRUSSELS, 0.4, 20),
  start_date: '2026-11-27',
  end_date: '2027-01-04',
  opening_hours: 'Mo-Su 12:00-22:00',
  type: 'christmas_market',
  duration_min: 75,
  url: null,
  ...extra
});
const tripOf = (extra = {}) => ({
  schemaVersion: 3,
  id: 'ev',
  title: 'Bruxelles',
  createdAt: 'x',
  updatedAt: 'x',
  deleted: false,
  destination: { name: 'Bruxelles', countryCode: 'BE', ...BRUSSELS, radiusKm: 10 },
  timezone: 'Europe/Brussels',
  currency: 'EUR',
  startDate: '2026-12-11',
  endDate: '2026-12-13',
  travelers: 6,
  mode: 'walk',
  profile: 'balanced',
  lunch: 'restaurant',
  dinner: 'restaurant',
  prefs: { vegetarian: false, wheelchair: false },
  lodgings: [],
  days: [],
  candidates: [],
  ...extra
});

describe('eventToPlace / eventsForTrip', () => {
  it('ligne -> lieu : catégorie du type, à voir de nuit, horaires et durée saisis', () => {
    expect(eventToPlace(row())).toMatchObject({
      id: 'event:plaisirs',
      category: 'market',
      source: 'event',
      nightSight: 'always',
      openingHours: 'Mo-Su 12:00-22:00',
      event: { type: 'christmas_market', startDate: '2026-11-27', endDate: '2027-01-04', durationMin: 75 }
    });
    expect(eventToPlace(row({ type: 'festival' }))).toMatchObject({ category: 'monument' });
    expect(eventToPlace(row({ type: 'festival' })).nightSight).toBeUndefined();
  });

  it('ligne incomplète, type inconnu ou dates à l’envers : ignorée', () => {
    expect(eventToPlace(row({ type: 'concert' }))).toBeNull();
    expect(eventToPlace(row({ name: ' ' }))).toBeNull();
    expect(eventToPlace(row({ start_date: '2027-01-05', end_date: '2027-01-04' }))).toBeNull();
  });

  it('seulement les événements du séjour, à moins du rayon de la destination', () => {
    const t = tripOf();
    expect(eventsForTrip([row()], t)).toHaveLength(1);
    expect(eventsForTrip([row({ start_date: '2026-12-14', end_date: '2026-12-20' })], t)).toHaveLength(0);
    expect(eventsForTrip([row({ ...destinationPoint(BRUSSELS, 30, 0) })], t)).toHaveLength(0);
    const place = eventToPlace(row({ start_date: '2026-12-12', end_date: '2026-12-12' }));
    expect([eventActiveOn(place, '2026-12-11'), eventActiveOn(place, '2026-12-12')]).toEqual([false, true]);
  });
});

describe('generateTrip : événement de saison', () => {
  const places = () => {
    const out = [];
    for (let i = 0; i < 10; i += 1) {
      out.push({ id: `musee-${i}`, name: `musee-${i}`, category: 'museum', ...destinationPoint(BRUSSELS, 0.3 + i * 0.1, i * 36), source: 't', certified: true, indoor: true, notoriety: 30 });
      out.push({ id: `parc-${i}`, name: `parc-${i}`, category: 'park', ...destinationPoint(BRUSSELS, 0.4 + i * 0.1, i * 36 + 10), source: 't', certified: false, indoor: false });
      out.push({ id: `resto-${i}`, name: `resto-${i}`, category: 'restaurant', ...destinationPoint(BRUSSELS, 0.2 + i * 0.08, i * 36 + 20), source: 't', certified: false, indoor: true, food: { regional: false, openingHours: 'Mo-Su 11:30-23:00' } });
    }
    return out;
  };
  let seq = 0;
  const run = (rows) => generateTrip({ trip: tripOf(), places: places(), events: eventsForTrip(rows, tripOf()), makeId: () => `e-${(seq += 1)}` }, RULES).trip;
  const eventSteps = (t) => t.days.flatMap((d) => d.steps.map((s) => ({ ...s, date: d.date }))).filter((s) => s.place?.source === 'event');

  it('marché de Noël saisi aux dates du séjour : proposé une fois, en fin de journée (après la tombée de la nuit)', () => {
    const t = run([row()]);
    const steps = eventSteps(t);
    expect(steps).toHaveLength(1);
    const day = t.days.find((d) => d.date === steps[0].date);
    expect(toMinutes(steps[0].start)).toBeGreaterThanOrEqual(toMinutes(day.sunset));
    // Durée saisie (75 min), éventuellement allongée par la compaction jusqu'à sa durée maximale.
    const length = toMinutes(steps[0].end) - toMinutes(steps[0].start);
    expect(length).toBeGreaterThanOrEqual(75);
    expect(length).toBeLessThanOrEqual(75 * RULES.durationRules.maxFactor);
    expect(day.steps.at(-1).type).toBe('dinner');
  });

  it('retiré de la table : absent du séjour suivant', () => {
    expect(eventSteps(run([]))).toHaveLength(0);
  });

  it('jamais en dehors de ses dates', () => {
    const t = run([row({ start_date: '2026-12-13', end_date: '2026-12-13' })]);
    expect(eventSteps(t).map((s) => s.date)).toEqual(['2026-12-13']);
  });
});
