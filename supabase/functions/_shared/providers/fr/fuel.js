import { boundingBox, distanceKm } from '../../domain/geo.js';
import { runSource } from '../../services/sourceRunner.js';
import { fetchTabularRows, resolveCsvResource } from './dataGouv.js';

/**
 * Prix des carburants en France, flux instantané v2 (ministères économiques
 * et financiers), via l'API tabulaire de data.gouv.fr. Les positions des
 * stations y sont des entiers (degrés × 100 000).
 */
export const FUEL_DATASET = '6407d088d4e23dc662022e2c';

/** Colonne de prix -> code carburant de Mon guide (Trip.fuelType). */
export const FUEL_COLUMNS = {
  'Prix Gazole': 'diesel',
  'Prix SP95': 'sp95',
  'Prix SP98': 'sp98',
  'Prix E10': 'e10',
  'Prix E85': 'e85',
  'Prix GPLc': 'lpg'
};

const COORD_FACTOR = 100000;

/**
 * Prix moyen par carburant des stations situées dans le rayon.
 * @param {Record<string, any>[]} rows
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @returns {import('../types.js').FuelPrices}
 */
export function averageFuelPrices(rows, point, radiusKm) {
  const stations = rows.filter((r) => {
    const lat = Number(r.latitude) / COORD_FACTOR;
    const lon = Number(r.longitude) / COORD_FACTOR;
    return Number.isFinite(lat) && Number.isFinite(lon) && distanceKm(point, { lat, lon }) <= radiusKm;
  });
  const prices = {};
  for (const [column, code] of Object.entries(FUEL_COLUMNS)) {
    const values = stations.map((s) => s[column]).filter((v) => typeof v === 'number' && v > 0);
    if (values.length) {
      const average = values.reduce((a, b) => a + b, 0) / values.length;
      prices[code] = { average: Math.round(average * 1000) / 1000, stations: values.length };
    }
  }
  return { currency: 'EUR', stationCount: stations.length, prices, source: 'Prix des carburants en France, flux instantané v2', estimate: false };
}

/**
 * @param {import('../types.js').Point} point
 * @param {number} radiusKm
 * @param {import('../types.js').ProviderContext} ctx
 */
export function fuel(point, radiusKm, ctx) {
  return runSource({
    name: 'fuel',
    cacheSource: 'fuel',
    params: { lat: point.lat, lon: point.lon, radius: radiusKm },
    ttlSec: ctx.rules.cacheTtlSec.fuel,
    cache: ctx.cache,
    fetcher: async () => {
      const resource = await resolveCsvResource(FUEL_DATASET, ctx);
      const box = boundingBox(point, radiusKm);
      const rows = await fetchTabularRows(
        resource.id,
        {
          latitude__greater: String(Math.floor(box.minLat * COORD_FACTOR)),
          latitude__less: String(Math.ceil(box.maxLat * COORD_FACTOR)),
          longitude__greater: String(Math.floor(box.minLon * COORD_FACTOR)),
          longitude__less: String(Math.ceil(box.maxLon * COORD_FACTOR))
        },
        ['latitude', 'longitude', ...Object.keys(FUEL_COLUMNS)]
      );
      return averageFuelPrices(rows, point, radiusKm);
    }
  });
}
