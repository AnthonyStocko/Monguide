import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { museumClosingDays } from './config/museumClosingDays.js';
import { destinationPoint } from './geo.js';
import { generateTrip } from './generateTrip.js';
import { usuallyClosed } from './openingHours.js';

const CENTER = { lat: 50.8467, lon: 4.3525 };
let seq = 0;
const makeId = () => `h-${(seq += 1)}`;
const place = (id, category, km, bearing, extra = {}) => ({
  id,
  name: id,
  category,
  ...destinationPoint(CENTER, km, bearing),
  source: 'test',
  certified: category !== 'restaurant',
  indoor: category === 'museum' || category === 'restaurant' ? true : category === 'monument' ? null : false,
  ...extra
});

function trip(startDate, endDate, countryCode = 'BE') {
  return {
    schemaVersion: 3,
    id: 'h',
    title: 'Bruxelles',
    createdAt: 'x',
    updatedAt: 'x',
    deleted: false,
    destination: { name: 'Bruxelles', countryCode, ...CENTER, radiusKm: 10 },
    timezone: 'Europe/Brussels',
    currency: 'EUR',
    startDate,
    endDate,
    travelers: 2,
    mode: 'walk',
    profile: 'balanced',
    lunch: 'restaurant',
    dinner: 'restaurant',
    prefs: { vegetarian: false, wheelchair: false },
    lodgings: [],
    days: [],
    candidates: []
  };
}

const base = () => [
  ...Array.from({ length: 6 }, (_, i) => place(`resto-${i}`, 'restaurant', 0.2 + i * 0.1, i * 60, { food: { regional: false, openingHours: 'Mo-Su 11:30-23:00' } })),
  ...Array.from({ length: 6 }, (_, i) => place(`parc-${i}`, 'park', 0.4 + i * 0.1, i * 60 + 30)),
  ...Array.from({ length: 4 }, (_, i) => place(`monument-${i}`, 'monument', 0.5 + i * 0.1, i * 90 + 10))
];
const steps = (t) => t.days.flatMap((d) => d.steps.map((s) => ({ ...s, date: d.date })));

describe('jours de fermeture habituels des musées (horaires inconnus)', () => {
  it('lundi par défaut, lundi et mardi en France', () => {
    expect(museumClosingDays('BE')).toEqual([1]);
    expect(museumClosingDays('fr')).toEqual([1, 2]);
    const museum = { category: 'museum' };
    expect(usuallyClosed(museum, '2026-12-14', 'BE')).toBe(true); // lundi
    expect(usuallyClosed(museum, '2026-12-15', 'BE')).toBe(false); // mardi
    expect(usuallyClosed(museum, '2026-12-15', 'FR')).toBe(true);
    expect(usuallyClosed({ ...museum, openingHours: 'Mo 10:00-17:00' }, '2026-12-14', 'BE')).toBe(false);
    expect(usuallyClosed({ category: 'monument' }, '2026-12-14', 'BE')).toBe(false);
  });

  it('un musée aux horaires inconnus n’est pas placé le lundi, mais le mardi, avec « Horaires à vérifier »', () => {
    const museum = place('musee', 'museum', 0.3, 0, { notoriety: 90, notable: true });
    const { trip: t } = generateTrip({ trip: trip('2026-12-14', '2026-12-15'), places: [...base(), museum], makeId }, RULES);
    const step = steps(t).find((s) => s.place?.id === 'musee');
    expect(step.date).toBe('2026-12-15');
    expect(step.badges).toContain('hours_unconfirmed');
  });

  it('un lieu fermé à toutes les dates du séjour (horaires connus) est écarté, réserve comprise', () => {
    const weekdaysOnly = place('semaine', 'monument', 0.25, 0, { openingHours: 'Mo-Fr 10:00-18:00', notoriety: 95, notable: true });
    const { trip: t } = generateTrip({ trip: trip('2026-12-12', '2026-12-13'), places: [...base(), weekdaysOnly], makeId }, RULES);
    expect(steps(t).some((s) => s.place?.id === 'semaine')).toBe(false);
    expect(t.candidates.some((p) => p.id === 'semaine')).toBe(false);
  });
});
