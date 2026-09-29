import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { destinationPoint } from './geo.js';
import { eveningRestaurants, generateTrip } from './generateTrip.js';
import { mealOpeningState } from './pickRestaurant.js';

const VILLEFRANCHE = { lat: 45.9865, lon: 4.7266 };
const BARCELONA = { lat: 41.3874, lon: 2.1686 };

let seq = 0;
const makeId = () => `id-${(seq += 1)}`;

function place(id, category, center, km, bearing, extra = {}) {
  const pos = destinationPoint(center, km, bearing);
  return {
    id,
    name: `${category} ${id}`,
    category,
    lat: pos.lat,
    lon: pos.lon,
    source: 'test',
    certified: category === 'museum' || category === 'monument',
    indoor: category === 'museum' || category === 'restaurant' ? true : category === 'monument' ? null : false,
    ...extra
  };
}

/**
 * Lieux autour d'un centre : visites, et restaurants de trois sortes (midi
 * seulement, soir seulement, midi et soir) pour vérifier les horaires.
 */
function placesAround(center, { eveningHours = 'Mo-Su 19:00-23:30' } = {}) {
  const out = [];
  for (let i = 0; i < 6; i += 1) {
    const b = i * 60;
    out.push(place(`museum-${i}`, 'museum', center, 0.5 + i * 0.4, b));
    out.push(place(`monument-${i}`, 'monument', center, 0.8 + i * 0.4, b + 20));
    out.push(place(`park-${i}`, 'park', center, 1 + i * 0.5, b + 40));
    out.push(place(`view-${i}`, 'viewpoint', center, 1.2 + i * 0.5, b + 60));
  }
  for (let i = 0; i < 8; i += 1) {
    const b = i * 45;
    out.push(place(`noon-${i}`, 'restaurant', center, 0.3 + i * 0.2, b, { food: { regional: true, openingHours: 'Mo-Su 12:00-14:30' } }));
    out.push(place(`night-${i}`, 'restaurant', center, 0.5 + i * 0.3, b + 15, { food: { regional: false, openingHours: eveningHours } }));
    out.push(place(`both-${i}`, 'restaurant', center, 0.7 + i * 0.3, b + 30, { food: { regional: false, openingHours: `Mo-Su 12:00-14:30,${eveningHours.replace('Mo-Su ', '')}` } }));
  }
  return out;
}

function trip(patch = {}) {
  return {
    schemaVersion: 2,
    id: 't1',
    title: 'Villefranche-sur-Saône',
    createdAt: 'x',
    updatedAt: 'x',
    deleted: false,
    destination: { name: 'Villefranche-sur-Saône', countryCode: 'FR', ...VILLEFRANCHE, radiusKm: 20 },
    timezone: 'Europe/Paris',
    currency: 'EUR',
    startDate: '2026-10-06',
    endDate: '2026-10-08',
    travelers: 2,
    mode: 'car',
    fuelType: 'diesel',
    profile: 'balanced',
    lunch: 'restaurant',
    dinner: 'restaurant',
    prefs: { vegetarian: false, wheelchair: false },
    lodgings: [],
    days: [],
    candidates: [],
    ...patch
  };
}

const run = (tripPatch = {}, places = placesAround(VILLEFRANCHE)) => generateTrip({ trip: trip(tripPatch), places, makeId }, RULES);
const stepOf = (day, type) => day.steps.find((s) => s.type === type);

describe('generateTrip : dîner', () => {
  it('séjour de 3 jours : un dîner par jour, 3 restaurants différents, distincts des déjeuners, ouverts le soir', () => {
    const { trip: t } = run();
    const dinners = t.days.map((d) => stepOf(d, 'dinner'));
    const lunches = t.days.map((d) => stepOf(d, 'lunch'));
    for (const d of t.days) expect(d.steps.map((s) => s.type)).toEqual(['culture', 'lunch', 'outdoor', 'relax', 'dinner']);
    expect(dinners.every((s) => s.place?.category === 'restaurant')).toBe(true);
    const ids = dinners.map((s) => s.place.id);
    expect(new Set(ids).size).toBe(3);
    for (const l of lunches) expect(ids).not.toContain(l.place.id);
    t.days.forEach((d, i) => {
      const s = dinners[i];
      expect(s).toMatchObject({ start: '19:30', end: '21:00' });
      const where = { date: d.date, lat: s.place.lat, lon: s.place.lon, countryCode: 'FR' };
      expect(mealOpeningState(s.place.food.openingHours, { ...where, meal: 'dinner', window: { start: s.start, end: s.end } }, RULES)).toBe('open');
    });
    // Détente 17:30 puis dîner 19:30, puis retour.
    for (const d of t.days) expect(stepOf(d, 'relax').end <= stepOf(d, 'dinner').start).toBe(true);
  });

  it('restaurant fermé sur une partie de la plage du dîner : jamais proposé', () => {
    // Soir 19:00-20:30 : la plage 19:30-21:00 n'est couverte qu'en partie.
    const places = placesAround(VILLEFRANCHE, { eveningHours: 'Mo-Su 19:00-20:30' });
    const { trip: t } = run({}, places);
    for (const d of t.days) expect(stepOf(d, 'dinner').badges).toEqual(['free_time']);
  });

  it('favorise la proximité de la dernière étape et de l\'hébergement du soir', () => {
    const hotel = { id: 'hotel', address: 'Hôtel', ...destinationPoint(VILLEFRANCHE, 3, 180), nights: ['2026-10-06', '2026-10-07'] };
    const nearHotel = place('near-hotel', 'restaurant', hotel, 0.1, 0, { food: { regional: false, openingHours: 'Mo-Su 19:00-23:00' } });
    const { trip: t } = run({ startDate: '2026-10-06', endDate: '2026-10-06', lodgings: [{ ...hotel, nights: ['2026-10-06'] }] }, [...placesAround(VILLEFRANCHE), nearHotel]);
    expect(stepOf(t.days[0], 'dinner').place.id).toBe('near-hotel');
  });

  it('préférences : un restaurant non végétarien n\'est jamais proposé au dîner', () => {
    const places = placesAround(VILLEFRANCHE).map((p) => (p.id.startsWith('night') || p.id.startsWith('both') ? { ...p, food: { ...p.food, vegetarian: false } } : p));
    const { trip: t } = run({ prefs: { vegetarian: true, wheelchair: false } }, places);
    for (const d of t.days) expect(stepOf(d, 'dinner').place).toBeUndefined();
  });

  it('horaires inconnus : proposé avec le badge "Horaires non confirmés"', () => {
    const places = placesAround(VILLEFRANCHE).filter((p) => p.category !== 'restaurant' || p.id.startsWith('noon'));
    places.push(place('unknown', 'restaurant', VILLEFRANCHE, 0.4, 10, { food: { regional: false } }));
    const { trip: t } = run({ startDate: '2026-10-06', endDate: '2026-10-06' }, places);
    expect(stepOf(t.days[0], 'dinner')).toMatchObject({ place: { id: 'unknown' }, badges: ['hours_unconfirmed'] });
  });

  it('à Barcelone, le dîner est proposé à 21:00', () => {
    const { trip: t } = run(
      { destination: { name: 'Barcelona', countryCode: 'ES', ...BARCELONA, radiusKm: 20 }, timezone: 'Europe/Madrid', currency: 'EUR' },
      placesAround(BARCELONA)
    );
    for (const d of t.days) expect(stepOf(d, 'dinner')).toMatchObject({ start: '21:00', end: '22:30' });
  });

  it('"Dîner : Libre" : créneau "Soirée libre" sans proposition', () => {
    const { trip: t, warnings } = run({ dinner: 'free' });
    for (const d of t.days) {
      const s = stepOf(d, 'dinner');
      expect(s).toMatchObject({ start: '19:30', end: '21:00', badges: [] });
      expect(s).not.toHaveProperty('place');
    }
    expect(warnings.find((w) => w.code === 'free_time')).toBeUndefined();
  });

  it('demande sans dîner (application antérieure) : aucun créneau de dîner', () => {
    const { trip: t } = run({ dinner: undefined });
    for (const d of t.days) expect(stepOf(d, 'dinner')).toBeUndefined();
  });

  it('réserve : au moins 10 restaurants ouverts le soir, même si le score les classe loin', () => {
    // Beaucoup de visites mieux classées que les restaurants : sans garantie, la réserve n'en garderait presque pas.
    const extra = Array.from({ length: 80 }, (_, i) => place(`extra-${i}`, 'museum', VILLEFRANCHE, 0.2 + (i % 10) * 0.05, i * 4));
    const { trip: t } = run({ startDate: '2026-10-06', endDate: '2026-10-06' }, [...placesAround(VILLEFRANCHE), ...extra]);
    const evening = t.candidates.filter((p) => p.category === 'restaurant' && /Mo-Su (12:00-14:30,)?19:00/.test(p.food.openingHours));
    expect(evening.length).toBeGreaterThanOrEqual(10);
    expect(t.candidates.length).toBeLessThanOrEqual(RULES.places.maxCandidates);
  });
});

describe('eveningRestaurants', () => {
  it('horaires confirmés d\'abord, puis inconnus ; fermés le soir exclus', () => {
    const noon = place('noon', 'restaurant', VILLEFRANCHE, 1, 0, { food: { regional: true, openingHours: 'Mo-Su 12:00-14:00' } });
    const unknown = place('unknown', 'restaurant', VILLEFRANCHE, 1, 90, { food: { regional: true } });
    const night = place('night', 'restaurant', VILLEFRANCHE, 1, 180, { food: { regional: false, openingHours: 'Mo-Su 19:00-23:00' } });
    const ctx = { dates: ['2026-10-06'], countryCode: 'FR', window: { start: '19:30', end: '21:00' }, prefs: { vegetarian: false, wheelchair: false } };
    expect(eveningRestaurants([noon, unknown, night], ctx, RULES).map((p) => p.id)).toEqual(['night', 'unknown']);
  });
});
