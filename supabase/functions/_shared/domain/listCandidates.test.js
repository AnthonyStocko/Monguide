import { describe, expect, it } from 'vitest';
import { ACTIVITY_TYPE_IDS, activityTypeOfCategory, stepTypeFor } from './config/activityTypes.js';
import { generateTrip } from './generateTrip.js';
import { destinationPoint } from './geo.js';
import { listCandidates, mergePlaces, originFor } from './listCandidates.js';
import { C, at, place, rules, standardDay, trip } from './testing/dayFixture.js';

const ids = (r) => r.items.map((i) => i.place.id);
const TUESDAY = '2026-10-06';

describe('activityTypes', () => {
  it('type d\'étape selon l\'heure : restaurant déjeuner ou dîner, marché déjeuner avant 15:00', () => {
    expect(stepTypeFor('restaurant', '12:30', rules)).toBe('lunch');
    expect(stepTypeFor('restaurant', '19:30', rules)).toBe('dinner');
    expect(stepTypeFor('market', '11:00', rules)).toBe('lunch');
    expect(stepTypeFor('market', '15:00', rules)).toBe('culture');
    expect(stepTypeFor('museum', '15:00', rules)).toBe('culture');
    expect(stepTypeFor('monument', '10:00', rules)).toBe('culture');
    expect(stepTypeFor('nature', '10:00', rules)).toBe('outdoor');
    expect(stepTypeFor('viewpoint', '10:00', rules)).toBe('outdoor');
    expect(stepTypeFor('small_heritage', '10:00', rules)).toBe('outdoor');
    expect(stepTypeFor('personal', '10:00', rules)).toBe('personal');
    expect(() => stepTypeFor('zoo', '10:00', rules)).toThrow(RangeError);
  });

  it('chaque catégorie de lieu (hors étape personnelle) appartient à un seul type', () => {
    expect(activityTypeOfCategory('park')).toBe('nature');
    expect(activityTypeOfCategory('farm')).toBe('market');
    expect(activityTypeOfCategory('personal')).toBeNull();
  });
});

describe('listCandidates', () => {
  // Restaurants à 0,3 km (déjà au programme), 0,8 km, 1,5 km et 3 km de C.
  const lunchOnly = place('noon', 'restaurant', 1.5, { name: 'Midi', food: { regional: false, openingHours: 'Mo-Su 12:00-14:00', cuisine: ['french'] } });
  const evening = place('evening', 'restaurant', 3, { name: 'Soir', food: { regional: false, openingHours: 'Mo-Su 19:00-23:00', cuisine: ['pizza'], vegetarian: true, wheelchair: 'yes' } });
  const unknown = place('unknown', 'restaurant', -0.8, { name: 'Sans horaires', food: { regional: false } });
  const t = trip([standardDay(TUESDAY)], [evening, lunchOnly, unknown, place('m2', 'museum', 2)]);
  const opts = (patch = {}) => ({ date: TUESDAY, time: '20:00', origin: C, ...patch });

  it('trie par temps de trajet estimé depuis l\'origine, avec la distance « ≈ »', () => {
    const r = listCandidates(t, 'restaurant', opts(), rules);
    expect(ids(r)).toEqual(['restaurant', 'unknown', 'noon', 'evening']);
    expect(r.items.map((i) => i.distanceKm)).toEqual([0.4, 1, 1.9, 3.9]);
    expect(r.items.every((i, k) => k === 0 || i.travelMin >= r.items[k - 1].travelMin)).toBe(true);
    // Depuis une autre origine (3 km à l'est), l'ordre s'inverse.
    expect(ids(listCandidates(t, 'restaurant', opts({ origin: at(3) }), rules))[0]).toBe('evening');
  });

  it('ouvert ou fermé à l\'heure choisie ; filtre « ouvert à 20:00 »', () => {
    const r = listCandidates(t, 'restaurant', opts(), rules);
    const state = Object.fromEntries(r.items.map((i) => [i.place.id, i.opening]));
    expect(state).toEqual({ restaurant: 'open', unknown: 'unknown', noon: 'closed', evening: 'open' });
    expect(ids(listCandidates(t, 'restaurant', opts({ filters: { open: true } }), rules))).toEqual(['restaurant', 'evening']);
    expect(r.items.find((i) => i.place.id === 'unknown').badges).toContain('hours_unconfirmed');
    // Sans heure choisie : état non évalué.
    expect(listCandidates(t, 'restaurant', { origin: C }, rules).items[0].opening).toBeNull();
  });

  it('lieu déjà au programme : signalé « Déjà prévu », pas masqué', () => {
    const r = listCandidates(t, 'restaurant', opts(), rules);
    expect(r.items.find((i) => i.place.id === 'restaurant').planned).toEqual({ date: TUESDAY, dayIndex: 0, stepId: 'lunch' });
    expect(r.items.find((i) => i.place.id === 'evening').planned).toBeNull();
  });

  it('filtres cuisine, végétarien, accès fauteuil et distance maximale', () => {
    expect(ids(listCandidates(t, 'restaurant', opts({ filters: { cuisine: 'pizza' } }), rules))).toEqual(['evening']);
    expect(ids(listCandidates(t, 'restaurant', opts({ filters: { vegetarian: true, wheelchair: true } }), rules))).toEqual(['evening']);
    expect(ids(listCandidates(t, 'restaurant', opts({ filters: { maxDistanceKm: 1 } }), rules))).toEqual(['restaurant', 'unknown']);
    expect(ids(listCandidates(t, 'museum', opts({ filters: { maxDistanceKm: 1 } }), rules))).toEqual(['museum']);
  });

  it('type sans candidat : liste vide ; étape personnelle : aucune liste', () => {
    expect(listCandidates(t, 'viewpoint', opts(), rules)).toEqual({ type: 'viewpoint', stepType: 'outdoor', items: [] });
    expect(listCandidates(t, 'personal', opts(), rules)).toEqual({ type: 'personal', stepType: 'personal', items: [] });
    expect(() => listCandidates(t, 'zoo', opts(), rules)).toThrow(RangeError);
  });

  it('type d\'étape selon l\'heure choisie', () => {
    expect(listCandidates(t, 'restaurant', opts({ time: '12:30' }), rules).stepType).toBe('lunch');
    expect(listCandidates(t, 'restaurant', opts(), rules).stepType).toBe('dinner');
  });

  it('« Plus de résultats » : lieux ajoutés sans doublon', () => {
    const page1 = [place('p1', 'park', 4), place('p2', 'park', 5)];
    const page2 = [place('p2', 'park', 5), place('p3', 'nature', 6)];
    const extra = mergePlaces(page1, page2);
    expect(extra.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    // Un lieu déjà dans la réserve ou au programme n'apparaît qu'une fois.
    const r = listCandidates(t, 'nature', opts({ extraPlaces: [...extra, t.days[0].steps[2].place] }), rules);
    expect(ids(r)).toEqual(['park', 'garden', 'p1', 'p2', 'p3']);
    expect(new Set(ids(r)).size).toBe(r.items.length);
  });

  it('origine : dernière étape avant l\'heure choisie, sinon hébergement, sinon destination', () => {
    expect(originFor(t, 0, '15:00')).toEqual({ lat: t.days[0].steps[2].place.lat, lon: t.days[0].steps[2].place.lon });
    expect(originFor(t, 0, '09:00')).toEqual({ lat: C.lat, lon: C.lon });
    const withLodging = { ...t, lodgings: [{ id: 'h', address: 'Hôtel', lat: 46, lon: 4.7, nights: [TUESDAY] }], days: [{ ...t.days[0], startLodgingId: 'h' }] };
    expect(originFor(withLodging, 0, '09:00')).toEqual({ lat: 46, lon: 4.7 });
  });
});

describe('listCandidates hors ligne : séjour à Villefranche-sur-Saône', () => {
  // Lieux réalistes autour de Villefranche : une poignée par type, à des distances variées.
  const around = (id, category, km, bearing, extra = {}) => {
    const p = destinationPoint(C, km, bearing);
    return { id, name: id, category, lat: p.lat, lon: p.lon, source: 'test', certified: ['museum', 'monument'].includes(category), indoor: category === 'museum' || category === 'restaurant', ...extra };
  };
  const places = [];
  for (let i = 0; i < 12; i += 1) {
    const b = i * 30;
    places.push(around(`musee-${i}`, 'museum', 0.5 + i * 0.3, b));
    places.push(around(`monument-${i}`, 'monument', 0.7 + i * 0.3, b + 5));
    places.push(around(`parc-${i}`, 'park', 1 + i * 0.4, b + 10));
    places.push(around(`vue-${i}`, 'viewpoint', 1.5 + i * 0.4, b + 15));
    places.push(around(`marche-${i}`, 'market', 0.6 + i * 0.3, b + 20));
    places.push(around(`patrimoine-${i}`, 'small_heritage', 0.9 + i * 0.3, b + 25));
    places.push(around(`resto-${i}`, 'restaurant', 0.4 + i * 0.2, b + 35, { food: { regional: i % 2 === 0, openingHours: 'Mo-Su 12:00-14:00,19:00-22:30' } }));
  }
  // Beaucoup de musées mieux classés : sans minimum par type, la réserve en serait remplie.
  for (let i = 0; i < 150; i += 1) places.push(around(`musee-extra-${i}`, 'museum', 0.2 + (i % 10) * 0.05, i * 2.4));

  const base = {
    schemaVersion: 2,
    id: 'villefranche',
    title: 'Villefranche-sur-Saône',
    createdAt: 'x',
    updatedAt: 'x',
    deleted: false,
    destination: { name: 'Villefranche-sur-Saône', countryCode: 'FR', ...C, radiusKm: 10 },
    timezone: 'Europe/Paris',
    currency: 'EUR',
    startDate: '2026-10-06',
    endDate: '2026-10-08',
    travelers: 2,
    mode: 'walk',
    lunch: 'both',
    dinner: 'restaurant',
    prefs: { vegetarian: false, wheelchair: false },
    lodgings: [],
    days: [],
    candidates: []
  };
  let seq = 0;
  const makeId = () => `s-${(seq += 1)}`;

  it.each(['certified', 'balanced', 'explorer'])('profil %s : chaque type affiche au moins un lieu non prévu, sans réseau', (profile) => {
    const { trip: t } = generateTrip({ trip: { ...base, profile }, places, makeId }, rules);
    expect(t.candidates.length).toBeLessThanOrEqual(rules.places.maxCandidates);
    for (const type of ACTIVITY_TYPE_IDS.filter((id) => id !== 'personal')) {
      const r = listCandidates(t, type, { date: '2026-10-07', time: '15:00', origin: originFor(t, 1, '15:00') }, rules);
      expect(r.items.filter((i) => !i.planned).length, type).toBeGreaterThanOrEqual(1);
    }
  });
});
