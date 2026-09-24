import { roundCoord } from './domain/geo.js';

const COORD_KEYS = new Set(['lat', 'lon', 'lng', 'latitude', 'longitude']);

function normalize(key, value) {
  if (COORD_KEYS.has(key)) {
    const n = Number(value);
    if (Number.isFinite(n)) return roundCoord(n).toFixed(2);
  }
  if (Array.isArray(value)) return value.map((item) => normalize('', item)).join(',');
  if (typeof value === 'string') return encodeURIComponent(value.trim().toLowerCase());
  return encodeURIComponent(String(value));
}

/**
 * Clé du cache partagé : source + paramètres normalisés (triés, chaînes en
 * minuscules, coordonnées arrondies à 0,01° ≈ 1 km). Deux utilisateurs
 * proches partagent donc la même entrée, sans position exacte conservée.
 * @param {string} source ex. "weather"
 * @param {Record<string, unknown>} [params]
 * @returns {string} ex. "weather:lat=48.86&lon=2.35"
 */
export function cacheKey(source, params = {}) {
  const parts = Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => `${k}=${normalize(k, params[k])}`);
  return parts.length ? `${source}:${parts.join('&')}` : source;
}
