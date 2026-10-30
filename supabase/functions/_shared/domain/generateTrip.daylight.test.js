import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { destinationPoint } from './geo.js';
import { generateTrip } from './generateTrip.js';
import { toMinutes } from './time.js';

const BRUSSELS = { lat: 50.8467, lon: 4.3525 };
const LYON = { lat: 45.7578, lon: 4.832 };
let seq = 0;
const makeId = () => `n-${(seq += 1)}`;

function place(center, id, category, km, bearing, extra = {}) {
  return {
    id,
    name: id,
    category,
    ...destinationPoint(center, km, bearing),
    source: 'test',
    certified: ['museum', 'monument'].includes(category),
    indoor: category === 'museum' || category === 'restaurant' ? true : category === 'monument' ? null : false,
    ...extra
  };
}

/** Ville variée : musées et églises (couverts), monuments, parcs, points de vue, restaurants ouverts midi et soir. */
function city(center) {
  const out = [];
  for (let i = 0; i < 10; i += 1) {
    out.push(place(center, `musee-${i}`, 'museum', 0.3 + i * 0.12, i * 36, { notoriety: 30 + i }));
    out.push(place(center, `eglise-${i}`, 'monument', 0.25 + i * 0.1, i * 36 + 10, { kind: 'church', indoor: true, notoriety: 25 }));
    out.push(place(center, `monument-${i}`, 'monument', 0.35 + i * 0.1, i * 36 + 20, { indoor: false, notoriety: 28 }));
    out.push(place(center, `parc-${i}`, 'park', 0.4 + i * 0.12, i * 36 + 5));
    out.push(place(center, `vue-${i}`, 'viewpoint', 0.5 + i * 0.1, i * 36 + 25));
    out.push(place(center, `resto-${i}`, 'restaurant', 0.2 + i * 0.08, i * 36 + 15, { food: { regional: false, openingHours: 'Mo-Su 11:30-23:00' } }));
  }
  return out;
}

function trip(center, countryCode, timezone, startDate, endDate, extra = {}) {
  return {
    schemaVersion: 3,
    id: `t-${countryCode}`,
    title: 'x',
    createdAt: 'x',
    updatedAt: 'x',
    deleted: false,
    destination: { name: 'x', countryCode, ...center, radiusKm: 10 },
    timezone,
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
    candidates: [],
    ...extra
  };
}

const outdoor = (s) => s.place && s.place.indoor !== true && !['museum', 'restaurant'].includes(s.place.category);
const visits = (d) => d.steps.filter((s) => s.place && !['lunch', 'dinner'].includes(s.type));
const deadMinutes = (d) =>
  d.steps.slice(1).reduce((sum, s, i) => {
    const gap = toMinutes(s.start) - (s.travelFromPreviousMin ?? 0) - toMinutes(d.steps[i].end);
    return sum + (gap > 0 ? gap : 0);
  }, 0);

describe('Bruxelles en décembre (nuit vers 16:40)', () => {
  const { trip: t } = generateTrip({ trip: trip(BRUSSELS, 'BE', 'Europe/Brussels', '2026-12-11', '2026-12-13'), places: city(BRUSSELS), makeId }, RULES);

  it('coucher du soleil enregistré pour chaque jour', () => {
    for (const d of t.days) expect(Math.abs(toMinutes(d.sunset) - toMinutes('16:39'))).toBeLessThanOrEqual(5);
  });

  it('aucune visite en extérieur qui finit après 16:15', () => {
    for (const d of t.days) for (const s of visits(d).filter(outdoor)) expect(s.end <= '16:15', `${d.date} ${s.place.id} ${s.end}`).toBe(true);
  });

  it('au moins une activité du soir (lieu couvert) chaque jour', () => {
    for (const d of t.days) expect(visits(d).some((s) => toMinutes(s.start) >= toMinutes(d.sunset) && !outdoor(s)), d.date).toBe(true);
  });

  it('un déjeuner et un dîner chaque jour, temps morts cumulés sous 45 min', () => {
    for (const d of t.days) {
      expect(d.steps.filter((s) => s.type === 'lunch' && s.place)).toHaveLength(1);
      expect(d.steps.filter((s) => s.type === 'dinner' && s.place)).toHaveLength(1);
      expect(deadMinutes(d), d.date).toBeLessThan(45);
    }
  });

  it('deux journées consécutives ne suivent pas le même gabarit', () => {
    for (let i = 1; i < t.days.length; i += 1) expect(t.days[i].steps[0].type).not.toBe(t.days[i - 1].steps[0].type);
  });
});

describe('Lyon en mai (coucher vers 21:00)', () => {
  const { trip: t } = generateTrip({ trip: trip(LYON, 'FR', 'Europe/Paris', '2027-05-14', '2027-05-15'), places: city(LYON), makeId }, RULES);

  it('visites en extérieur possibles en fin de journée, dîner jamais avant 19:00', () => {
    const latestOutdoor = t.days.flatMap((d) => visits(d).filter(outdoor).map((s) => s.end)).sort().at(-1);
    expect(latestOutdoor >= '18:00').toBe(true);
    for (const d of t.days) expect(d.steps.find((s) => s.type === 'dinner').start >= '19:00').toBe(true);
  });
});

describe('rythme du séjour', () => {
  const lodging = { id: 'hotel', name: 'Hôtel du Centre', address: '1 place', ...destinationPoint(LYON, 0.2, 0), nights: ['2027-05-14'] };
  const run = (pace, extra = {}) =>
    generateTrip({ trip: trip(LYON, 'FR', 'Europe/Paris', '2027-05-14', '2027-05-15', { pace, lodgings: [lodging], ...extra }), places: city(LYON), makeId }, RULES).trip;

  it('tranquille : un temps libre par jour en fin d’après-midi, près de l’hébergement ; visites plus longues', () => {
    const t = run('relaxed');
    for (const d of t.days) {
      const free = d.steps.filter((s) => s.badges.includes('free_time'));
      expect(free).toHaveLength(1);
      expect(free[0].place.id).toBe('lodging:hotel');
      expect(free[0].start >= '14:00').toBe(true);
    }
    const museum = (tr) => tr.days.flatMap((d) => d.steps).find((s) => s.place?.category === 'museum');
    const length = (s) => toMinutes(s.end) - toMinutes(s.start);
    expect(length(museum(t))).toBeGreaterThanOrEqual(length(museum(run('balanced'))));
  });

  it('équilibré : aucun temps libre, sauf demandé dans « Vos envies »', () => {
    expect(run('balanced').days.flatMap((d) => d.steps).some((s) => s.badges.includes('free_time'))).toBe(false);
    expect(run('balanced', { params: { wishes: 'Un peu de temps libre chaque jour' } }).days.flatMap((d) => d.steps).some((s) => s.badges.includes('free_time'))).toBe(true);
  });
});
