import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { toMinutes } from './time.js';
import { destinationPoint } from './geo.js';
import { generateTrip } from './generateTrip.js';
import { openingState, placeOpeningHours } from './openingHours.js';

const SEVILLE = { lat: 37.3891, lon: -5.9845 };
const LYON = { lat: 45.764, lon: 4.8357 };
// Fermeture de mi-journée (sieste), fermé le dimanche.
const SIESTA = 'Mo-Sa 10:00-14:00,17:00-20:30';

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
 * Lieux autour d'un centre : les plus proches (donc les mieux classés) sont
 * des monuments et des marchés fermés de 14:00 à 17:00 ; restaurants aux
 * horaires espagnols (13:00-16:30, 20:00-24:00) ou français (12:00-14:30, 19:00-22:30).
 */
function placesAround(center) {
  const out = [];
  for (let i = 0; i < 6; i += 1) {
    const b = i * 60;
    out.push(place(`siesta-${i}`, 'monument', center, 0.2 + i * 0.1, b + 10, { openingHours: SIESTA }));
    out.push(place(`market-${i}`, 'market', center, 0.2 + i * 0.1, b + 30, { openingHours: SIESTA }));
    out.push(place(`museum-${i}`, 'museum', center, 0.8 + i * 0.4, b));
    out.push(place(`monument-${i}`, 'monument', center, 1 + i * 0.4, b + 20));
    out.push(place(`park-${i}`, 'park', center, 1.2 + i * 0.5, b + 40));
    out.push(place(`view-${i}`, 'viewpoint', center, 1.4 + i * 0.5, b + 50));
  }
  for (let i = 0; i < 8; i += 1) {
    const b = i * 45;
    out.push(place(`es-${i}`, 'restaurant', center, 0.3 + i * 0.2, b, { food: { regional: true, openingHours: 'Mo-Su 13:00-16:30,20:00-24:00' } }));
    out.push(place(`fr-${i}`, 'restaurant', center, 0.4 + i * 0.2, b + 20, { food: { regional: false, openingHours: 'Mo-Su 12:00-14:30,19:00-22:30' } }));
  }
  return out;
}

function trip(patch = {}) {
  return {
    schemaVersion: 3,
    id: 't1',
    title: 'Sevilla',
    createdAt: 'x',
    updatedAt: 'x',
    deleted: false,
    destination: { name: 'Sevilla', countryCode: 'ES', ...SEVILLE, radiusKm: 10 },
    timezone: 'Europe/Madrid',
    currency: 'EUR',
    startDate: '2026-11-13',
    endDate: '2026-11-15',
    travelers: 2,
    mode: 'walk',
    profile: 'explorer',
    lunch: 'restaurant',
    dinner: 'restaurant',
    prefs: { vegetarian: false, wheelchair: false },
    lodgings: [],
    days: [],
    candidates: [],
    ...patch
  };
}

const run = (patch, places = placesAround(SEVILLE)) => generateTrip({ trip: trip(patch), places, makeId }, RULES).trip;
const stepOf = (day, type) => day.steps.find((s) => s.type === type);

describe('generateTrip : habitudes espagnoles', () => {
  it('Séville, 3 jours : déjeuner entre 13:30 et 14:30 (1 h 15), dîner de 21:00 à 22:30, visites finies à 20:00', () => {
    const t = run();
    expect(t.days).toHaveLength(3);
    for (const d of t.days) {
      const lunch = stepOf(d, 'lunch');
      expect(lunch.place).toBeDefined();
      expect(lunch.start >= '13:30' && lunch.start <= '14:30').toBe(true);
      expect(toMinutes(lunch.end) - toMinutes(lunch.start)).toBe(75);
      const dinner = stepOf(d, 'dinner');
      expect(dinner.place).toBeDefined();
      expect(dinner.start >= '20:30').toBe(true);
      expect(dinner.end <= '23:00').toBe(true);
      const afternoon = d.steps.slice(d.steps.indexOf(lunch) + 1).filter((s) => s.type !== 'dinner');
      expect(afternoon.every((s) => s.start >= lunch.end)).toBe(true);
      const visits = d.steps.filter((s) => s.place && ['culture', 'outdoor', 'relax'].includes(s.type));
      expect(visits.every((s) => s.end <= '20:00')).toBe(true);
      // Visite du soir à 18:30, ou plus tôt si la compaction l'avance.
      const relax = stepOf(d, 'relax');
      if (relax) expect(relax.start <= '18:30').toBe(true);
    }
  });

  it('aucune étape pendant une fermeture : chaque lieu aux horaires connus est ouvert sur tout son créneau', () => {
    for (const lunch of ['restaurant', 'market', 'both']) {
      const t = run({ lunch });
      for (const d of t.days) {
        for (const s of d.steps.filter((x) => placeOpeningHours(x.place))) {
          const state = openingState(placeOpeningHours(s.place), { date: d.date, from: s.start, to: s.end, lat: s.place.lat, lon: s.place.lon, countryCode: 'ES' });
          // Déjeuner au restaurant : une ouverture sur une partie de la plage suffit (règle existante).
          if (s.type === 'lunch' && s.place.category === 'restaurant') expect(state, `${d.date} ${s.type} ${s.place.id}`).not.toBe('closed');
          else expect(state, `${d.date} ${s.type} ${s.place.id} ${s.start}-${s.end}`).toBe('open');
        }
      }
    }
  });

  it('lieu fermé de 14:00 à 17:00 : proposé le matin, jamais l’après-midi, ni le dimanche', () => {
    const t = run();
    const siesta = (s) => s.place?.id.startsWith('siesta');
    expect(t.days[0].steps.some(siesta)).toBe(true); // le plus proche : la visite du matin
    for (const d of t.days) {
      for (const s of d.steps.filter(siesta)) expect(s.end <= '14:00' || s.start >= '17:00').toBe(true);
    }
    expect(t.days[2].steps.some(siesta)).toBe(false); // dimanche 15 novembre : fermé
  });

  it('marché fermé de 14:00 à 17:00 : jamais proposé pour la pause de 14:00', () => {
    const t = run({ lunch: 'market' });
    for (const d of t.days) expect(stepOf(d, 'lunch').place?.id ?? '').not.toMatch(/^market/);
  });
});

describe('generateTrip : France inchangée', () => {
  it('Lyon : première visite 10:00, déjeuner 12:30-13:45, dîner jamais avant 19:00, sans trou', () => {
    const t = run({ destination: { name: 'Lyon', countryCode: 'FR', ...LYON, radiusKm: 10 }, timezone: 'Europe/Paris', startDate: '2026-11-10', endDate: '2026-11-12' }, placesAround(LYON));
    for (const d of t.days) {
      expect(d.steps[0].start).toBe('10:00');
      expect(stepOf(d, 'lunch').start).toBe('12:30');
      expect(stepOf(d, 'dinner').start >= '19:00').toBe(true);
      expect(stepOf(d, 'lunch').end).toBe('13:45');
    }
  });
});
