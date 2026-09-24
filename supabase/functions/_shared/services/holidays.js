import { ExternalError } from '../errors.js';
import { fetchExternal } from '../http.js';

/**
 * Jours fériés, pour tous les pays (France comprise) : API Nager.Date
 * (date.nager.at, sans clé), endpoint /api/v3/PublicHolidays/{année}/{pays}.
 * Utilisés pour le badge "Jour férié : horaires susceptibles de changer" et
 * pour l'évaluation des horaires d'ouverture (opening_hours "PH").
 */
const NAGER_URL = 'https://date.nager.at/api/v3/PublicHolidays';

/**
 * @typedef {object} Holiday
 * @property {string} date "YYYY-MM-DD"
 * @property {string} name nom en anglais
 * @property {string} localName nom dans la langue du pays
 * @property {boolean} global férié dans tout le pays
 * @property {string[]} [regions] codes ISO 3166-2 des régions concernées (si non global)
 */

/**
 * @param {Record<string, any>} h élément Nager.Date
 * @returns {Holiday}
 */
export function toHoliday(h) {
  const holiday = { date: h.date, name: h.name, localName: h.localName, global: h.global !== false };
  return Array.isArray(h.counties) && h.counties.length ? { ...holiday, regions: h.counties } : holiday;
}

/**
 * Jours fériés d'une année. Nager.Date répond 204 (sans corps) ou 404 pour
 * un pays qu'il ne connaît pas : liste vide.
 * @param {string} countryCode ISO 3166-1 alpha-2
 * @param {number} year
 * @returns {Promise<Holiday[]>}
 */
export async function fetchHolidays(countryCode, year) {
  let res;
  try {
    res = await fetchExternal(`${NAGER_URL}/${year}/${countryCode.toUpperCase()}`, { source: 'nager.date', headers: { Accept: 'application/json' } });
  } catch (err) {
    if (err?.upstreamStatus === 404) return [];
    throw err;
  }
  if (res.status === 204) return [];
  const json = await res.json().catch(() => {
    throw new ExternalError('nager.date', res.status, false);
  });
  return Array.isArray(json) ? json.map(toHoliday) : [];
}

/**
 * @param {Holiday[]} holidays
 * @param {string} startDate
 * @param {string} endDate
 */
export function holidaysBetween(holidays, startDate, endDate) {
  return holidays.filter((h) => h.date >= startDate && h.date <= endDate).sort((a, b) => a.date.localeCompare(b.date));
}
