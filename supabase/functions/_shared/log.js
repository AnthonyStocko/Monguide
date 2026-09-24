import { roundCoord } from './domain/geo.js';

/**
 * Journaux structurés en JSON (une ligne par événement). Confidentialité :
 * jamais d'e-mail, d'adresse ni d'IP ; coordonnées arrondies à 2 décimales.
 */

const FORBIDDEN_KEY = /mail|address|adresse|street|^ip$|ipaddress|phone|password|token|authorization/i;
const COORD_KEY = /^(lat|lon|lng|latitude|longitude)$/i;
const EMAIL = /[^\s@"'<>]+@[^\s@"'<>]+\.[a-z]{2,}/gi;
// Nombre décimal avec au moins 3 décimales : coordonnée potentielle.
const PRECISE_NUMBER = /-?\d{1,3}\.\d{3,}/g;

/**
 * Nettoie récursivement les champs d'un journal.
 * @param {unknown} value
 * @param {string} [key]
 * @returns {unknown}
 */
export function sanitize(value, key = '') {
  if (typeof value === 'number') {
    return COORD_KEY.test(key) && Number.isFinite(value) ? roundCoord(value) : value;
  }
  if (typeof value === 'string') {
    return value
      .replace(EMAIL, '[email]')
      .replace(PRECISE_NUMBER, (n) => String(roundCoord(Number(n))));
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, key));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(k)) continue;
      out[k] = sanitize(v, k);
    }
    return out;
  }
  return value;
}

/**
 * @param {'info' | 'warn' | 'error'} level
 * @param {string} event identifiant court (ex. "request", "external_call")
 * @param {Record<string, unknown>} [fields]
 */
export function log(level, event, fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...sanitize(fields) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
