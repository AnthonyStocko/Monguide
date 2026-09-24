import { isValidTimeZone } from '../domain/dates.js';
import { ExternalError } from '../errors.js';
import { fetchExternalJson } from '../http.js';

/**
 * Fuseau horaire IANA d'une position, déterminé par Open-Meteo
 * (timezone=auto : le champ "timezone" de la réponse). Un pays peut en avoir
 * plusieurs (Portugal et Açores, Espagne et Canaries…), d'où une détermination
 * par position et jamais par pays.
 * @param {{ lat: number, lon: number }} point
 * @returns {Promise<string>}
 */
export async function timezoneAt(point) {
  const params = new URLSearchParams({
    latitude: String(point.lat),
    longitude: String(point.lon),
    timezone: 'auto',
    forecast_days: '1',
    daily: 'weather_code'
  });
  const json = await fetchExternalJson(`https://api.open-meteo.com/v1/forecast?${params}`, { source: 'open-meteo' });
  if (!isValidTimeZone(json?.timezone)) throw new ExternalError('open-meteo', null, false);
  return json.timezone;
}
