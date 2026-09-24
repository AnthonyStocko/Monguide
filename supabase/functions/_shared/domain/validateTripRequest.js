import { countryInfo } from './config/countries.js';
import { daysBetween, isValidDate, isValidTimeZone } from './dates.js';
import { FUEL_TYPES, LUNCH_OPTIONS, PROFILES, TRAVEL_MODES } from './model.js';
import { tripNights } from './tripDraft.js';

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isPoint = (p) => p && isNumber(p.lat) && isNumber(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

/**
 * Vérifie une demande de génération (séjour issu du formulaire). Renvoie la
 * liste des champs invalides (vide si la demande est valide).
 * @param {any} trip
 * @returns {string[]}
 */
export function validateTripRequest(trip, rules) {
  if (!trip || typeof trip !== 'object') return ['tripRequest'];
  const errors = [];
  const d = trip.destination;
  if (!d || typeof d.name !== 'string' || !d.name.trim() || !isPoint(d)) errors.push('destination');
  else {
    if (!countryInfo(d.countryCode)) errors.push('destination.countryCode');
    if (!rules.trip.radiusOptionsKm.includes(d.radiusKm)) errors.push('destination.radiusKm');
  }
  if (!isValidTimeZone(trip.timezone)) errors.push('timezone');
  if (!isValidDate(trip.startDate)) errors.push('startDate');
  if (!isValidDate(trip.endDate)) errors.push('endDate');
  else if (isValidDate(trip.startDate)) {
    const days = daysBetween(trip.startDate, trip.endDate) + 1;
    if (days < 1 || days > rules.trip.maxDays) errors.push('endDate');
  }
  if (!Number.isInteger(trip.travelers) || trip.travelers < 1 || trip.travelers > rules.trip.maxTravelers) errors.push('travelers');
  if (!TRAVEL_MODES.includes(trip.mode)) errors.push('mode');
  if (trip.mode === 'car' && !FUEL_TYPES.includes(trip.fuelType)) errors.push('fuelType');
  if (trip.fuelConsumption !== undefined && (!isNumber(trip.fuelConsumption) || trip.fuelConsumption <= 0 || trip.fuelConsumption > 30)) errors.push('fuelConsumption');
  if (!PROFILES.includes(trip.profile)) errors.push('profile');
  if (!LUNCH_OPTIONS.includes(trip.lunch)) errors.push('lunch');
  if (!trip.prefs || typeof trip.prefs.vegetarian !== 'boolean' || typeof trip.prefs.wheelchair !== 'boolean') errors.push('prefs');
  if (!Array.isArray(trip.lodgings)) errors.push('lodgings');
  else if (isValidDate(trip.startDate) && isValidDate(trip.endDate)) {
    const nights = new Set(tripNights(trip.startDate, trip.endDate));
    const seen = new Set();
    for (const l of trip.lodgings) {
      const ok = l && typeof l.id === 'string' && typeof l.address === 'string' && isPoint(l) && Array.isArray(l.nights) && l.nights.every((n) => nights.has(n) && !seen.has(n));
      if (!ok) {
        errors.push('lodgings');
        break;
      }
      l.nights.forEach((n) => seen.add(n));
    }
  }
  return errors;
}
