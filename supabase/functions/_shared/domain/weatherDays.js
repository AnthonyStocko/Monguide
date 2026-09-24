import { eachDate } from './dates.js';

/**
 * @typedef {object} WeatherHour
 * @property {string} hour "HH:00", heure locale de la destination
 * @property {number | null} precipitationProbability %
 * @property {number | null} temperature °C
 * @property {number | null} weatherCode code WMO
 */

/**
 * @typedef {{ date: string, available: true, hours: WeatherHour[] } | { date: string, available: false }} WeatherDay
 */

/**
 * Découpe une prévision horaire Open-Meteo en jours du séjour.
 *
 * Les horodatages Open-Meteo (paramètre timezone fourni) sont des heures
 * locales de la destination SANS décalage, ex. "2026-09-23T10:00". Ils ne
 * sont jamais convertis avec new Date() (qui les lirait dans le fuseau de
 * l'appareil) : date et heure sont extraites comme des chaînes.
 *
 * Un jour est disponible s'il est couvert par la prévision, c'est-à-dire s'il
 * a au moins une heure avec une valeur connue ; sinon : available false.
 * Le dernier jour de la fenêtre peut n'avoir que températures et codes météo,
 * sans probabilité de pluie (null = inconnue).
 *
 * @param {{ time: string[], precipitation_probability: (number|null)[], temperature_2m: (number|null)[], weather_code: (number|null)[] }} hourly
 * @param {string} startDate "YYYY-MM-DD"
 * @param {string} endDate "YYYY-MM-DD"
 * @returns {WeatherDay[]}
 */
export function buildWeatherDays(hourly, startDate, endDate) {
  /** @type {Map<string, WeatherHour[]>} */
  const byDate = new Map();
  hourly.time.forEach((stamp, i) => {
    const date = stamp.slice(0, 10);
    const hour = stamp.slice(11, 16);
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push({
      hour,
      precipitationProbability: hourly.precipitation_probability?.[i] ?? null,
      temperature: hourly.temperature_2m?.[i] ?? null,
      weatherCode: hourly.weather_code?.[i] ?? null
    });
  });

  return eachDate(startDate, endDate).map((date) => {
    const hours = byDate.get(date);
    const covered = hours?.some((h) => h.precipitationProbability !== null || h.temperature !== null || h.weatherCode !== null);
    if (!covered) {
      return { date, available: false };
    }
    return { date, available: true, hours };
  });
}
