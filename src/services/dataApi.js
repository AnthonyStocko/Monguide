import { callFunction } from './api.js';
import { getRules } from './rules.js';

/**
 * Appels aux fonctions de données du serveur (docs/api.md). Passe par
 * api.js, seul point d'accès réseau de l'application.
 */

/**
 * Recherche de destination (autocomplétion) ou recherche inverse.
 * @param {{ q: string } | { lat: number, lon: number }} query
 * @param {'fr' | 'en'} lang
 * @returns {Promise<{ results: object[] }>}
 */
export async function geocode(query, lang) {
  const params = new URLSearchParams({ ...Object.fromEntries(Object.entries(query).map(([k, v]) => [k, String(v)])), lang });
  const { data } = await callFunction(`geocode?${params}`, { method: 'GET' });
  return data;
}

/**
 * Prévisions par jour du séjour. La réponse est gardée localement et
 * resservie hors ligne (fromCache: true).
 * @param {{ lat: number, lon: number, timezone: string, startDate: string, endDate: string }} params
 */
export function getWeather(params) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return callFunction(`weather?${qs}`, { method: 'GET', cacheKey: `weather:${qs}` });
}

/**
 * Lieux candidats autour d'une destination, avec l'état de chaque source.
 * @param {{ lat: number, lon: number, radiusKm: number, countryCode: string, profile: string, lunch: string, lang: string }} params
 */
export function getPlaces(params) {
  const key = ['places', params.lat, params.lon, params.radiusKm, params.countryCode, params.lunch, params.lang].join(':');
  // Délai propre : les sources ont leurs propres délais côté serveur (Wikidata 15 s).
  return callFunction('places', { method: 'POST', body: params, cacheKey: key, timeoutMs: getRules().api.placesTimeoutMs });
}

/**
 * Jours fériés d'un pays entre deux dates.
 * @param {{ countryCode: string, startDate: string, endDate: string }} params
 */
export function getHolidays(params) {
  const qs = new URLSearchParams(params);
  return callFunction(`holidays?${qs}`, { method: 'GET', cacheKey: `holidays:${qs}` });
}

/**
 * Prix des carburants à destination, dans la monnaie du pays.
 * @param {{ lat: number, lon: number, radiusKm: number, countryCode: string }} params
 */
export function getFuel(params) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  return callFunction(`fuel?${qs}`, { method: 'GET', cacheKey: `fuel:${qs}` });
}
