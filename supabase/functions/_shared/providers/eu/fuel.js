import { EU_MEMBERS, countryInfo } from '../../domain/config/countries.js';
import { log } from '../../log.js';
import { FUEL_ESTIMATES } from './fuelEstimates.js';

/**
 * Prix des carburants hors de France : moyennes NATIONALES (pas de prix par
 * station), dans la monnaie du pays.
 *  - pays de l'UE : dernier Bulletin pétrolier enregistré dans la table
 *    fuel_prices_eu par la fonction planifiée fuel-eu-refresh ;
 *  - autres pays : estimations fixes (fuelEstimates.js).
 */

/**
 * @param {{ country_code: string, fuel: string, price: number, currency: string, bulletin_date: string }[]} rows
 *   lignes du dernier bulletin du pays
 * @returns {import('../types.js').FuelPrices | null}
 */
export function fromBulletinRows(rows) {
  if (!rows.length) return null;
  const bulletinDate = rows.reduce((d, r) => (r.bulletin_date > d ? r.bulletin_date : d), '');
  const latest = rows.filter((r) => r.bulletin_date === bulletinDate);
  return {
    currency: latest[0].currency,
    prices: Object.fromEntries(latest.map((r) => [r.fuel, { average: Number(r.price) }])),
    date: bulletinDate,
    source: 'European Commission, Weekly Oil Bulletin',
    estimate: false
  };
}

/**
 * @param {string} countryCode
 * @returns {import('../types.js').FuelPrices | null}
 */
export function fromEstimates(countryCode) {
  const e = FUEL_ESTIMATES[countryCode];
  if (!e) return null;
  return {
    currency: e.currency,
    prices: Object.fromEntries(Object.entries(e.prices).map(([fuel, average]) => [fuel, { average }])),
    date: e.date,
    source: e.source,
    estimate: true
  };
}

/**
 * @param {import('../types.js').Point} _point prix nationaux : la position n'est pas utilisée
 * @param {number} _radiusKm
 * @param {import('../types.js').ProviderContext} ctx ctx.countryCode, ctx.fuelStore
 * @returns {Promise<import('../../services/sourceRunner.js').SourceOutcome<import('../types.js').FuelPrices>>}
 */
export async function fuel(_point, _radiusKm, ctx) {
  const country = countryInfo(ctx.countryCode)?.code;
  if (!country) return { name: 'fuel', status: 'failed', message: 'unsupported_country' };
  if (!EU_MEMBERS.includes(country)) {
    const data = fromEstimates(country);
    return data ? { name: 'fuel', status: 'ok', data } : { name: 'fuel', status: 'failed', message: 'no_data' };
  }
  try {
    const data = fromBulletinRows(await ctx.fuelStore.latest(country));
    return data ? { name: 'fuel', status: 'ok', data } : { name: 'fuel', status: 'failed', message: 'no_data' };
  } catch (err) {
    log('warn', 'fuel_store_failed', { message: String(err?.message ?? err) });
    return { name: 'fuel', status: 'failed', message: 'store_unavailable' };
  }
}
