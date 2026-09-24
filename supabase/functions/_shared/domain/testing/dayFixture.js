// Données de test (jamais importées par l'application ni par le serveur) :
// journée type 10h00 / 12h30 / 14h30 / 17h30 autour de Villefranche-sur-Saône,
// lieux alignés sur un même grand cercle (distances additives), à pied.
import { RULES } from '../config/rules.js';
import { destinationPoint } from '../geo.js';

export const rules = RULES;
export const C = { lat: 45.9865, lon: 4.7266 };

/** Point à x km à l'est de C (même grand cercle : distances additives). */
export const at = (km) => {
  const p = destinationPoint(C, Math.abs(km), km >= 0 ? 90 : 270);
  return { lat: p.lat, lon: p.lon };
};

export function place(id, category, km, extra = {}) {
  return { id, name: extra.name ?? id, category, ...at(km), source: 'test', certified: false, indoor: category === 'museum' ? true : category === 'restaurant' ? true : false, ...extra };
}

export function step(id, type, start, end, p, extra = {}) {
  const s = { id, type, start, end, indoor: p ? p.indoor : null, status: 'planned', customTime: false, locked: false, badges: p ? [] : ['free_time'], ...extra };
  if (p) s.place = p;
  return s;
}

export function personal(id, start, end, { km = null, title = 'Visite d’un proche', indoor = true } = {}) {
  const s = { id, type: 'personal', category: 'personal', source: 'user', title, start, end, indoor, status: 'planned', customTime: true, locked: true, badges: [] };
  if (km !== null) s.place = { id: `user:${id}`, name: title, address: '1 rue de test', category: 'personal', source: 'user', certified: false, indoor, ...at(km) };
  return s;
}

// Musée à 0 km, restaurant à 0,3 km, proche à 0,9 km, parc à 1,52 km (10 min du proche), jardin à 1,82 km.
export const museum = place('museum', 'museum', 0, { name: 'Musée Paul-Dini' });
export const restaurant = place('restaurant', 'restaurant', 0.3, { name: 'Le Bouchon', food: { regional: true, openingHours: 'Mo-Su 12:00-14:30,19:00-22:00' } });
export const park = place('park', 'park', 1.52, { name: 'Parc Vermorel' });
export const garden = place('garden', 'park', 1.82, { name: 'Jardin de la Garenne' });
export const FRIEND_KM = 0.9;

export function standardDay(date = '2026-10-06') {
  return {
    date,
    weatherAvailable: false,
    steps: [
      step('culture', 'culture', '10:00', '11:30', museum),
      step('lunch', 'lunch', '12:30', '13:45', restaurant),
      step('outdoor', 'outdoor', '14:30', '16:00', park),
      step('relax', 'relax', '17:30', '19:00', garden)
    ]
  };
}

export function trip(days = [standardDay()], candidates = []) {
  return {
    schemaVersion: 1,
    id: 'trip-1',
    title: 'Villefranche',
    createdAt: '2026-09-24T10:00:00.000Z',
    updatedAt: '2026-09-24T10:00:00.000Z',
    deleted: false,
    destination: { name: 'Villefranche-sur-Saône', countryCode: 'FR', ...C, radiusKm: 10 },
    timezone: 'Europe/Paris',
    currency: 'EUR',
    startDate: days[0].date,
    endDate: days[days.length - 1].date,
    travelers: 2,
    mode: 'walk',
    profile: 'explorer',
    lunch: 'both',
    prefs: { vegetarian: false, wheelchair: false },
    lodgings: [],
    days,
    candidates
  };
}

export const ctxOf = (t, dayIndex = 0) => ({ trip: t, dayIndex, day: t.days[dayIndex], mode: t.mode, countryCode: t.destination.countryCode });
