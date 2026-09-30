import { ACTIVITY_TYPES, stepTypeFor } from './config/activityTypes.js';
import { openingState, placeOpeningHours } from './openingHours.js';
import { fromMinutes, toMinutes } from './time.js';
import { routeKm, travelMinutes } from './travel.js';

/**
 * Liste des lieux d'un type proposé (config/activityTypes.js), pour ajouter
 * ou choisir une étape. Fonction pure, utilisable hors ligne : elle lit la
 * réserve du séjour (trip.candidates), les lieux déjà au programme et, en
 * ligne, les lieux supplémentaires du bouton « Plus de résultats »
 * (extraPlaces, fonction places avec categories et offset).
 */

/** Badges d'un lieu de la liste (traduits par l'application), en plus du code de certification. */
export const CANDIDATE_BADGES = { hoursUnconfirmed: 'hours_unconfirmed', infoMissing: 'info_missing' };

/**
 * @typedef {object} CandidateItem
 * @property {import('./model.js').Place} place
 * @property {number} travelMin trajet estimé depuis l'origine, en minutes
 * @property {number} distanceKm distance estimée (≈, détour compris), arrondie à 0,1 km
 * @property {'open' | 'closed' | 'unknown' | null} opening à l'heure choisie ; null sans date ni heure
 * @property {string[]} badges code de certification, hours_unconfirmed, info_missing
 * @property {{ date: string, dayIndex: number, stepId: string } | null} planned lieu déjà au programme
 *   (« Déjà prévu (samedi) ») : signalé, jamais masqué
 */

/**
 * Point de départ vers une étape ajoutée à une heure donnée : lieu de la
 * dernière étape (avec un lieu) qui commence avant cette heure, sinon
 * hébergement de départ du jour, sinon destination.
 * @param {import('./model.js').Trip} trip
 * @param {number} dayIndex
 * @param {string} time "HH:mm"
 * @returns {{ lat: number, lon: number }}
 */
export function originFor(trip, dayIndex, time) {
  const day = trip.days[dayIndex];
  const before = (day?.steps ?? []).filter((s) => s.place && toMinutes(s.start) <= toMinutes(time));
  const last = before[before.length - 1];
  if (last) return { lat: last.place.lat, lon: last.place.lon };
  const lodging = day?.startLodgingId ? trip.lodgings?.find((l) => l.id === day.startLodgingId) : null;
  if (lodging) return { lat: lodging.lat, lon: lodging.lon };
  return { lat: trip.destination.lat, lon: trip.destination.lon };
}

/**
 * Ajoute des lieux à une liste sans doublon (même identifiant), dans l'ordre.
 * @param {object[]} places
 * @param {object[]} incoming
 * @returns {object[]}
 */
export function mergePlaces(places, incoming) {
  const seen = new Set(places.map((p) => p.id));
  const out = [...places];
  for (const p of incoming) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

/** Texte comparable : minuscules, sans accents. */
const fold = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Le nom du lieu (nom enregistré ou une de ses variantes par langue)
 * contient-il le texte cherché ? Casse et accents indifférents.
 * @param {{ name: string, names?: Record<string, string> }} place
 * @param {string} query
 */
export function matchesName(place, query) {
  const q = fold(query).trim();
  if (!q) return true;
  return [place.name, ...Object.values(place.names ?? {})].some((n) => fold(n).includes(q));
}

/**
 * Cuisines (valeurs OSM) des restaurants d'une liste, les plus fréquentes
 * d'abord, au plus `limit` : puces de filtre.
 * @param {{ place: object }[]} items
 * @param {number} [limit]
 * @returns {string[]}
 */
export function cuisineOptions(items, limit = 6) {
  const counts = new Map();
  for (const { place } of items) for (const c of place.food?.cuisine ?? []) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([c]) => c);
}

/** Lieux au programme du séjour : identifiant -> première occurrence. */
function plannedPlaces(trip) {
  const out = new Map();
  (trip.days ?? []).forEach((day, dayIndex) => {
    for (const s of day.steps) if (s.place && !out.has(s.place.id)) out.set(s.place.id, { date: day.date, dayIndex, stepId: s.id, place: s.place });
  });
  return out;
}

/**
 * @param {import('./model.js').Trip} trip
 * @param {string} type identifiant de ACTIVITY_TYPES (sauf "personal" : liste vide)
 * @param {{
 *   date?: string,
 *   time?: string,
 *   origin?: { lat: number, lon: number } | null,
 *   filters?: { open?: boolean, cuisine?: string, vegetarian?: boolean, wheelchair?: boolean, maxDistanceKm?: number, query?: string },
 *   extraPlaces?: object[]
 * }} options date, time : jour et heure choisis ; origin : étape précédente ou
 *   hébergement (originFor), destination par défaut. Filtres des restaurants : open (ouvert à
 *   l'heure choisie, horaires connus), cuisine (valeur OSM), vegetarian, wheelchair (accès
 *   complet ou partiel) ; filtres communs : maxDistanceKm, query (recherche par nom, matchesName).
 * @returns {{ type: string, stepType: string | null, items: CandidateItem[] }} triés par trajet, puis distance, puis nom
 */
export function listCandidates(trip, type, { date, time, origin, filters = {}, extraPlaces = [] } = {}, rules) {
  const def = ACTIVITY_TYPES[type];
  if (!def) throw new RangeError(`Type d'activité inconnu : ${type}`);
  const stepType = time ? stepTypeFor(type, time, rules) : null;
  if (!def.categories.length) return { type, stepType, items: [] };

  const from = origin ?? { lat: trip.destination.lat, lon: trip.destination.lon };
  const planned = plannedPlaces(trip);
  const pool = mergePlaces(mergePlaces([...trip.candidates ?? []], [...planned.values()].map((p) => p.place)), extraPlaces);
  const isRestaurant = type === 'restaurant';
  const prefs = trip.prefs ?? { vegetarian: false, wheelchair: false };
  const countryCode = trip.destination.countryCode;

  const items = [];
  for (const place of pool) {
    if (!def.categories.includes(place.category)) continue;
    if (filters.query && !matchesName(place, filters.query)) continue;
    const distance = Math.round(routeKm(from, place, rules) * 10) / 10;
    if (filters.maxDistanceKm !== undefined && distance > filters.maxDistanceKm) continue;

    let opening = null;
    if (date && time) {
      const state = openingState(placeOpeningHours(place), { date, from: time, to: fromMinutes(toMinutes(time) + 1), lat: place.lat, lon: place.lon, countryCode });
      opening = state === 'partial' ? 'open' : state;
    }
    const food = place.food ?? {};
    if (isRestaurant) {
      if (filters.open && opening !== 'open') continue;
      if (filters.cuisine && !(food.cuisine ?? []).includes(filters.cuisine)) continue;
      if (filters.vegetarian && food.vegetarian !== true) continue;
      if (filters.wheelchair && food.wheelchair !== 'yes' && food.wheelchair !== 'limited') continue;
    }

    const badges = [];
    if (place.certification) badges.push(place.certification);
    if (isRestaurant) {
      if (opening === 'unknown') badges.push(CANDIDATE_BADGES.hoursUnconfirmed);
      if ((prefs.vegetarian && food.vegetarian === undefined) || (prefs.wheelchair && food.wheelchair === undefined)) badges.push(CANDIDATE_BADGES.infoMissing);
    }
    const p = planned.get(place.id);
    items.push({
      place,
      travelMin: travelMinutes(from, place, trip.mode, rules),
      distanceKm: distance,
      opening,
      badges,
      planned: p ? { date: p.date, dayIndex: p.dayIndex, stepId: p.stepId } : null
    });
  }
  items.sort((a, b) => a.travelMin - b.travelMin || a.distanceKm - b.distanceKm || a.place.name.localeCompare(b.place.name));
  return { type, stepType, items };
}
