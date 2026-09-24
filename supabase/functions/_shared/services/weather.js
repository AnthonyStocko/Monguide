import { fetchExternalJson } from '../http.js';

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Nombre de jours de prévision demandés. Obligatoire : la valeur par défaut
 * d'Open-Meteo n'est que de 7 jours. 16 jours = aujourd'hui + 15.
 */
export const FORECAST_DAYS = 16;

/**
 * Prévision horaire Open-Meteo dans le fuseau de la destination : les
 * horodatages renvoyés ("2026-09-23T10:00") sont des heures LOCALES sans
 * décalage (voir domain/weatherDays.js).
 * @param {{ lat: number, lon: number }} point
 * @param {string} timezone IANA, fuseau du séjour
 * @returns {Promise<{ time: string[], precipitation_probability: (number|null)[], temperature_2m: (number|null)[], weather_code: (number|null)[] }>}
 */
export async function fetchHourlyForecast(point, timezone) {
  const params = new URLSearchParams({
    latitude: String(point.lat),
    longitude: String(point.lon),
    hourly: 'precipitation_probability,temperature_2m,weather_code',
    timezone,
    forecast_days: String(FORECAST_DAYS)
  });
  const json = await fetchExternalJson(`${OPEN_METEO_URL}?${params}`, { source: 'open-meteo' });
  if (!Array.isArray(json?.hourly?.time)) throw new TypeError('Open-Meteo: hourly.time missing');
  return json.hourly;
}
