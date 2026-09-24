import { isValidDate, isValidTimeZone } from './domain/dates.js';
import { AppError } from './errors.js';

/**
 * Lecture et validation des entrées des fonctions. Toute valeur invalide
 * lève une erreur 400 invalid_input dont le message nomme le champ.
 */

const invalid = (field, detail) => new AppError(400, 'invalid_input', `${field}: ${detail}`);

/**
 * @param {unknown} value nombre ou chaîne numérique
 * @param {string} field
 * @param {{ min?: number, max?: number }} [bounds]
 */
export function readNumber(value, field, { min = -Infinity, max = Infinity } = {}) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  if (!Number.isFinite(n)) throw invalid(field, 'number required');
  if (n < min || n > max) throw invalid(field, `must be between ${min} and ${max}`);
  return n;
}

/** @returns {{ lat: number, lon: number }} */
export function readPoint(lat, lon) {
  return { lat: readNumber(lat, 'lat', { min: -90, max: 90 }), lon: readNumber(lon, 'lon', { min: -180, max: 180 }) };
}

/**
 * @template {string} T
 * @param {unknown} value
 * @param {string} field
 * @param {readonly T[]} allowed
 * @param {T} [fallback] valeur par défaut si absente
 * @returns {T}
 */
export function readEnum(value, field, allowed, fallback) {
  if ((value === undefined || value === null || value === '') && fallback !== undefined) return fallback;
  if (!allowed.includes(/** @type {T} */ (value))) throw invalid(field, `one of ${allowed.join(', ')}`);
  return /** @type {T} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} field
 * @param {{ min?: number, max?: number }} [length]
 */
export function readString(value, field, { min = 1, max = 200 } = {}) {
  if (typeof value !== 'string') throw invalid(field, 'string required');
  const s = value.trim();
  if (s.length < min || s.length > max) throw invalid(field, `length must be between ${min} and ${max}`);
  return s;
}

/** @param {unknown} value @param {string} field */
export function readDate(value, field) {
  if (!isValidDate(value)) throw invalid(field, 'date YYYY-MM-DD required');
  return /** @type {string} */ (value);
}

/** @param {unknown} value */
export function readTimeZone(value) {
  if (!isValidTimeZone(value)) throw invalid('timezone', 'IANA time zone required');
  return /** @type {string} */ (value);
}

/**
 * Corps JSON d'une requête POST.
 * @param {Request} req
 * @returns {Promise<Record<string, unknown>>}
 */
export async function readJsonBody(req) {
  try {
    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) return body;
  } catch {
    // corps absent ou illisible
  }
  throw invalid('body', 'JSON object required');
}
