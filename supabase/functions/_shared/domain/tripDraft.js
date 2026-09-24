import { countryInfo } from './config/countries.js';
import { addDays, daysBetween, eachDate, isValidDate, isValidTimeZone } from './dates.js';
import { distanceKm } from './geo.js';
import { FUEL_TYPES, LUNCH_OPTIONS, PROFILES, SCHEMA_VERSION, TRAVEL_MODES } from './model.js';

/**
 * Brouillon du formulaire de création de séjour (6 étapes) : validation par
 * étape, nuits et hébergements, construction du Trip final. Les messages
 * d'erreur sont des clés de traduction (tripForm.errors.*).
 */

/** Étapes du formulaire, dans l'ordre. */
export const STEPS = Object.freeze(['destination', 'dates', 'lodging', 'transport', 'profile', 'summary']);

/** Choix d'hébergement de l'étape 3. */
export const LODGING_MODES = Object.freeze(['same', 'multiple', 'unknown']);

/**
 * @typedef {object} LodgingPlace Hébergement saisi (adresse précise).
 * @property {string} [name] ex. "Hôtel du Parc"
 * @property {string} address
 * @property {number} lat
 * @property {number} lon
 */

/**
 * @typedef {object} TripDraft
 * @property {number} step index de l'étape courante
 * @property {{ name: string, country: string, countryCode: string, region?: string, lat: number, lon: number, timezone: string } | null} destination
 * @property {number} radiusKm
 * @property {string} startDate
 * @property {string} endDate
 * @property {number} travelers
 * @property {'same' | 'multiple' | 'unknown' | null} lodgingMode
 * @property {LodgingPlace | null} lodging hébergement unique (lodgingMode "same")
 * @property {(LodgingPlace | null)[]} nightLodgings choix explicites par nuit (null = comme la veille)
 * @property {string | null} mode
 * @property {string | null} fuelType
 * @property {string} profile
 * @property {string} lunch
 * @property {{ vegetarian: boolean, wheelchair: boolean }} prefs
 */

/** @returns {TripDraft} */
export function emptyDraft(rules) {
  return {
    step: 0,
    destination: null,
    radiusKm: rules.trip.defaultRadiusKm,
    startDate: '',
    endDate: '',
    travelers: 1,
    lodgingMode: null,
    lodging: null,
    nightLodgings: [],
    mode: null,
    fuelType: null,
    profile: 'balanced',
    lunch: 'both',
    prefs: { vegetarian: false, wheelchair: false }
  };
}

/**
 * Nuits du séjour : chaque date d'arrivée jusqu'à la veille du départ.
 * @param {string} startDate
 * @param {string} endDate
 * @returns {string[]}
 */
export function tripNights(startDate, endDate) {
  if (!isValidDate(startDate) || !isValidDate(endDate) || endDate <= startDate) return [];
  return eachDate(startDate, addDays(endDate, -1));
}

/** Les restaurants font-ils partie du déjeuner ? (préférences affichées) */
export function includesRestaurants(lunch) {
  return lunch === 'restaurant' || lunch === 'both';
}

/**
 * Hébergement effectif de chaque nuit : le choix explicite de la nuit, sinon
 * celui de la veille (pré-remplissage).
 * @param {TripDraft} draft
 * @returns {(LodgingPlace | null)[]}
 */
export function effectiveNightLodgings(draft) {
  const nights = tripNights(draft.startDate, draft.endDate);
  const out = [];
  for (let i = 0; i < nights.length; i += 1) out.push(draft.nightLodgings[i] ?? (i > 0 ? out[i - 1] : null));
  return out;
}

const samePlace = (a, b) => a && b && a.lat === b.lat && a.lon === b.lon && (a.name ?? '') === (b.name ?? '') && a.address === b.address;

/**
 * Regroupe les nuits consécutives passées au même endroit en un Lodging.
 * @param {string[]} nights dates des nuits
 * @param {(LodgingPlace | null)[]} places hébergement de chaque nuit
 * @param {() => string} makeId
 * @returns {import('./model.js').Lodging[]}
 */
export function groupLodgings(nights, places, makeId) {
  const lodgings = [];
  nights.forEach((night, i) => {
    const place = places[i];
    if (!place) return;
    const last = lodgings[lodgings.length - 1];
    if (last && samePlace(last, place) && last.nights[last.nights.length - 1] === nights[i - 1]) {
      last.nights.push(night);
      return;
    }
    const lodging = { id: makeId(), address: place.address, lat: place.lat, lon: place.lon, nights: [night] };
    if (place.name) lodging.name = place.name;
    lodgings.push(lodging);
  });
  return lodgings;
}

/**
 * Hébergements du brouillon selon le choix de l'étape 3.
 * @param {TripDraft} draft
 * @param {() => string} makeId
 */
export function lodgingsFromDraft(draft, makeId) {
  const nights = tripNights(draft.startDate, draft.endDate);
  if (draft.lodgingMode === 'same' && draft.lodging) return groupLodgings(nights, nights.map(() => draft.lodging), makeId);
  if (draft.lodgingMode === 'multiple') return groupLodgings(nights, effectiveNightLodgings(draft), makeId);
  return [];
}

/**
 * Hébergements éloignés de la destination (au-delà de farFactor × rayon) :
 * avertissement non bloquant.
 * @param {{ lat: number, lon: number }[]} places
 * @param {{ lat: number, lon: number }} destination
 * @param {number} radiusKm
 * @param {any} rules
 * @returns {{ place: object, km: number }[]}
 */
export function farLodgings(places, destination, radiusKm, rules) {
  const limit = rules.lodging.farFactor * radiusKm;
  const seen = new Set();
  return places
    .filter((p) => p && !seen.has(`${p.lat},${p.lon}`) && seen.add(`${p.lat},${p.lon}`))
    .map((place) => ({ place, km: Math.round(distanceKm(destination, place)) }))
    .filter(({ place }) => distanceKm(destination, place) > limit);
}

/**
 * Une partie du séjour est-elle au-delà de la fenêtre de prévision météo ?
 * @param {string} endDate
 * @param {string} today date du jour à destination
 */
export function beyondForecast(endDate, today, rules) {
  return isValidDate(endDate) && isValidDate(today) && daysBetween(today, endDate) >= rules.weather.forecastDays;
}

/**
 * Erreurs d'une étape : { champ: clé de traduction }. Objet vide si valide.
 * @param {string} step nom de l'étape (STEPS)
 * @param {TripDraft} draft
 * @param {{ rules: any, today: string }} ctx today = date du jour à destination
 * @returns {Record<string, string>}
 */
export function validateStep(step, draft, { rules, today }) {
  const errors = {};
  if (step === 'destination') {
    const d = draft.destination;
    if (!d) errors.destination = 'destinationRequired';
    else if (!countryInfo(d.countryCode)) errors.destination = 'destinationUnsupported';
    else if (!isValidTimeZone(d.timezone)) errors.destination = 'destinationRequired';
    if (!rules.trip.radiusOptionsKm.includes(draft.radiusKm)) errors.radiusKm = 'radiusRequired';
  }
  if (step === 'dates') {
    if (!isValidDate(draft.startDate)) errors.startDate = 'startDateRequired';
    else if (isValidDate(today) && draft.startDate < today) errors.startDate = 'startDatePast';
    if (!isValidDate(draft.endDate)) errors.endDate = 'endDateRequired';
    else if (isValidDate(draft.startDate)) {
      const days = daysBetween(draft.startDate, draft.endDate) + 1;
      if (days < 1) errors.endDate = 'endBeforeStart';
      else if (days > rules.trip.maxDays) errors.endDate = 'tooLong';
    }
    if (!Number.isInteger(draft.travelers) || draft.travelers < 1 || draft.travelers > rules.trip.maxTravelers) errors.travelers = 'travelersInvalid';
  }
  if (step === 'lodging') {
    const nights = tripNights(draft.startDate, draft.endDate);
    if (nights.length) {
      if (!LODGING_MODES.includes(draft.lodgingMode)) errors.lodgingMode = 'lodgingModeRequired';
      else if (draft.lodgingMode === 'same' && !draft.lodging) errors.lodging = 'lodgingRequired';
      else if (draft.lodgingMode === 'multiple') {
        effectiveNightLodgings(draft).forEach((place, i) => {
          if (!place) errors[`night-${i}`] = 'nightLodgingRequired';
        });
      }
    }
  }
  if (step === 'transport') {
    if (!TRAVEL_MODES.includes(draft.mode)) errors.mode = 'modeRequired';
    else if (draft.mode === 'car' && !FUEL_TYPES.includes(draft.fuelType)) errors.fuelType = 'fuelTypeRequired';
  }
  if (step === 'profile') {
    if (!PROFILES.includes(draft.profile)) errors.profile = 'profileRequired';
    if (!LUNCH_OPTIONS.includes(draft.lunch)) errors.lunch = 'lunchRequired';
  }
  if (step === 'summary') {
    for (const s of STEPS.slice(0, -1)) {
      if (Object.keys(validateStep(s, draft, { rules, today })).length) errors[s] = 'stepIncomplete';
    }
  }
  return errors;
}

/**
 * Première étape invalide, ou -1.
 * @param {TripDraft} draft
 */
export function firstInvalidStep(draft, ctx) {
  return STEPS.slice(0, -1).findIndex((s) => Object.keys(validateStep(s, draft, ctx)).length > 0);
}

/**
 * Séjour (modèle Trip) à partir d'un brouillon valide ; les jours seront
 * remplis par la génération (phase 4).
 * @param {TripDraft} draft
 * @param {{ id: string, now: string, makeId: () => string }} options
 * @returns {import('./model.js').Trip}
 */
export function buildTrip(draft, { id, now, makeId }) {
  const d = draft.destination;
  const country = countryInfo(d.countryCode);
  const trip = {
    schemaVersion: SCHEMA_VERSION,
    id,
    title: d.name,
    createdAt: now,
    updatedAt: now,
    deleted: false,
    destination: { name: d.name, countryCode: country.code, lat: d.lat, lon: d.lon, radiusKm: draft.radiusKm },
    timezone: d.timezone,
    currency: country.currency,
    startDate: draft.startDate,
    endDate: draft.endDate,
    travelers: draft.travelers,
    mode: draft.mode,
    profile: draft.profile,
    lunch: draft.lunch,
    // Les préférences ne portent que sur les restaurants.
    prefs: includesRestaurants(draft.lunch) ? { ...draft.prefs } : { vegetarian: false, wheelchair: false },
    lodgings: lodgingsFromDraft(draft, makeId),
    days: [],
    candidates: []
  };
  if (draft.mode === 'car') trip.fuelType = draft.fuelType;
  return trip;
}
