import OpeningHours from 'opening_hours';
import { destinationLocalDate, toMinutes } from './time.js';

/**
 * Horaires d'ouverture OSM (syntaxe opening_hours) évalués sur une plage
 * horaire d'un jour, à l'heure locale de la destination. Le pays est transmis
 * à la librairie, qui connaît les jours fériés de chaque pays (règles "PH").
 */

/** Horaires d'un lieu, s'ils sont connus (restaurants : champ food). */
export function placeOpeningHours(place) {
  return place?.food?.openingHours ?? place?.openingHours;
}

function parse(openingHours, { lat, lon, countryCode }) {
  if (!openingHours) return null;
  try {
    return new OpeningHours(openingHours, { lat, lon, address: { country_code: countryCode.toLowerCase(), state: '' } });
  } catch {
    return null;
  }
}

/**
 * État d'ouverture sur une plage.
 * @param {string | undefined} openingHours
 * @param {{ date: string, from: string, to: string, lat: number, lon: number, countryCode: string }} ctx
 * @returns {'open' | 'partial' | 'closed' | 'unknown'} open : ouvert sur toute la plage ; partial : sur une partie
 */
export function openingState(openingHours, { date, from, to, lat, lon, countryCode }) {
  const oh = parse(openingHours, { lat, lon, countryCode });
  if (!oh) return 'unknown';
  try {
    const start = destinationLocalDate(date, from);
    const end = destinationLocalDate(date, to);
    const total = toMinutes(to) - toMinutes(from);
    if (total <= 0) return 'unknown';
    const open = oh
      .getOpenIntervals(start, end)
      .filter(([, , unknown]) => !unknown)
      .reduce((sum, [a, b]) => sum + (b.getTime() - a.getTime()) / 60000, 0);
    if (open <= 0) return 'closed';
    return open >= total - 0.5 ? 'open' : 'partial';
  } catch {
    return 'unknown';
  }
}

/**
 * Horaires d'un jour en clair, ex. "12:00–14:00, 19:00–22:00" ; "" si fermé ;
 * null si inconnus.
 * @param {string | undefined} openingHours
 * @param {{ date: string, lat: number, lon: number, countryCode: string }} ctx
 */
export function openingHoursOfDay(openingHours, { date, lat, lon, countryCode }) {
  const oh = parse(openingHours, { lat, lon, countryCode });
  if (!oh) return null;
  try {
    const two = (n) => String(n).padStart(2, '0');
    const hhmm = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`;
    const intervals = oh.getOpenIntervals(destinationLocalDate(date, '00:00'), new Date(destinationLocalDate(date, '23:59').getTime() + 60000));
    return intervals
      .filter(([, , unknown]) => !unknown)
      .map(([a, b]) => `${hhmm(a)}–${b.getHours() === 0 && b.getMinutes() === 0 && b.getDate() !== a.getDate() ? '24:00' : hhmm(b)}`)
      .join(', ');
  } catch {
    return null;
  }
}
