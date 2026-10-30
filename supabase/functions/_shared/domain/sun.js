import { DateTime } from 'luxon';

/**
 * Lever et coucher du soleil (algorithme du « Almanac for Computers », US
 * Naval Observatory, repris par la NOAA : précision de l'ordre de la minute
 * aux latitudes européennes). Calcul local, sans réseau : disponible pour
 * toutes les dates d'un séjour, y compris au-delà des 16 jours de la
 * prévision Open-Meteo.
 */

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const mod = (x, m) => ((x % m) + m) % m;

/** Zénith officiel : centre du soleil 50' sous l'horizon (réfraction et rayon). */
const ZENITH = 90.833;

/**
 * Heure UTC (en heures, 0-24) du lever ou du coucher ; null aux latitudes où
 * le soleil ne se lève ou ne se couche pas ce jour-là.
 */
function utcHours(dayOfYear, lat, lon, rising) {
  const lngHour = lon / 15;
  const t = dayOfYear + ((rising ? 6 : 18) - lngHour) / 24;
  const M = 0.9856 * t - 3.289;
  const L = mod(M + 1.916 * Math.sin(rad(M)) + 0.02 * Math.sin(rad(2 * M)) + 282.634, 360);
  let RA = mod(deg(Math.atan(0.91764 * Math.tan(rad(L)))), 360);
  RA = (RA + Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90) / 15;
  const sinDec = 0.39782 * Math.sin(rad(L));
  const cosDec = Math.cos(Math.asin(sinDec));
  const cosH = (Math.cos(rad(ZENITH)) - sinDec * Math.sin(rad(lat))) / (cosDec * Math.cos(rad(lat)));
  if (cosH > 1 || cosH < -1) return null;
  const H = (rising ? 360 - deg(Math.acos(cosH)) : deg(Math.acos(cosH))) / 15;
  const T = H + RA - 0.06571 * t - 6.622;
  return mod(T - lngHour, 24);
}

/**
 * Lever et coucher du soleil d'un jour, à l'heure locale de la destination.
 * @param {string} date "YYYY-MM-DD"
 * @param {{ lat: number, lon: number }} point
 * @param {string} timezone IANA
 * @returns {{ sunrise: string | null, sunset: string | null }} "HH:mm" ; null sans lever ou coucher
 */
export function sunTimes(date, { lat, lon }, timezone) {
  const day = DateTime.fromISO(date, { zone: 'utc' });
  const toLocal = (hours) => {
    if (hours === null) return null;
    const minutes = Math.round(hours * 60);
    return day.startOf('day').plus({ minutes }).setZone(timezone).toFormat('HH:mm');
  };
  return { sunrise: toLocal(utcHours(day.ordinal, lat, lon, true)), sunset: toLocal(utcHours(day.ordinal, lat, lon, false)) };
}
