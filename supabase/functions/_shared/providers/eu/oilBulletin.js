import { SUPPORTED_COUNTRIES } from '../../domain/config/countries.js';
import { excelSerialToDate, readFirstSheet } from '../../services/xlsx.js';

/**
 * Bulletin pétrolier hebdomadaire de la Commission européenne (Weekly Oil
 * Bulletin), fichier "Prices with taxes, latest prices" : prix moyens
 * nationaux TTC en EUR pour 1 000 litres, une ligne par pays de l'UE.
 * Adresse stable du document (vérifiée le 2026-09-24 sur
 * energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en).
 */
export const WOB_LATEST_URL = 'https://energy.ec.europa.eu/document/download/264c2d0f-f161-4ea3-a777-78faae59bea0_en';

/** Taux de change de référence quotidiens de la BCE (devise pour 1 EUR). */
export const ECB_RATES_URL = 'https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml';

/** Noms des pays dans le bulletin -> code ISO. */
export const WOB_COUNTRIES = {
  Austria: 'AT', Belgium: 'BE', Bulgaria: 'BG', Croatia: 'HR', Cyprus: 'CY', Czechia: 'CZ', Denmark: 'DK',
  Estonia: 'EE', Finland: 'FI', France: 'FR', Germany: 'DE', Greece: 'GR', Hungary: 'HU', Ireland: 'IE',
  Italy: 'IT', Latvia: 'LV', Lithuania: 'LT', Luxembourg: 'LU', Malta: 'MT', Netherlands: 'NL', Poland: 'PL',
  Portugal: 'PT', Romania: 'RO', Slovakia: 'SK', Slovenia: 'SI', Spain: 'ES', Sweden: 'SE'
};

/** En-têtes de colonnes -> code carburant de Mon guide. */
const FUEL_HEADERS = [
  [/euro-super 95/i, 'sp95'],
  [/automotive gas oil|gas oil automobile/i, 'diesel'],
  [/GPL pour moteur|LPG|autogas/i, 'lpg']
];

/**
 * @typedef {object} BulletinPrice
 * @property {string} country ISO 3166-1 alpha-2
 * @property {'sp95' | 'diesel' | 'lpg'} fuel
 * @property {number} eurPerLitre
 */

/**
 * Lit le bulletin : date et prix par pays et carburant (EUR par litre).
 * @param {Uint8Array} xlsx
 * @returns {Promise<{ bulletinDate: string, prices: BulletinPrice[] }>}
 */
export async function parseOilBulletin(xlsx) {
  const rows = await readFirstSheet(xlsx);
  const header = rows[0] ?? [];
  const columns = FUEL_HEADERS.map(([re, fuel]) => [header.findIndex((h) => typeof h === 'string' && re.test(h)), fuel]).filter(
    ([i]) => i > 0
  );
  if (columns.length !== FUEL_HEADERS.length) throw new TypeError('Bulletin : colonnes de carburants introuvables');

  const serial = rows.slice(0, 5).map((r) => r[0]).find((v) => typeof v === 'number');
  if (!serial) throw new TypeError('Bulletin : date introuvable');
  // Les prix sont exprimés pour 1 000 litres (ligne des unités "1000 l").
  const perThousand = columns.every(([i]) => rows.slice(0, 5).some((r) => typeof r[i] === 'string' && /1000\s*l/i.test(r[i])));
  if (!perThousand) throw new TypeError('Bulletin : unité inattendue');

  const prices = [];
  for (const row of rows) {
    const country = WOB_COUNTRIES[typeof row[0] === 'string' ? row[0].trim() : ''];
    if (!country) continue;
    for (const [i, fuel] of columns) {
      const value = row[i];
      if (typeof value === 'number' && value > 0) prices.push({ country, fuel, eurPerLitre: Math.round(value) / 1000 });
    }
  }
  return { bulletinDate: excelSerialToDate(serial), prices };
}

/**
 * Taux BCE : { date, rates: { PLN: 4.3765, … } } (devise pour 1 EUR).
 * @param {string} xml
 */
export function parseEcbRates(xml) {
  const date = /time=['"](\d{4}-\d{2}-\d{2})['"]/.exec(xml)?.[1];
  const rates = Object.fromEntries([...xml.matchAll(/currency=['"]([A-Z]{3})['"]\s+rate=['"]([\d.]+)['"]/g)].map((m) => [m[1], Number(m[2])]));
  if (!date || !Object.keys(rates).length) throw new TypeError('BCE : taux introuvables');
  return { date, rates: { ...rates, EUR: 1 } };
}

/**
 * Lignes de la table fuel_prices_eu : prix convertis dans la monnaie du pays.
 * @param {{ bulletinDate: string, prices: BulletinPrice[] }} bulletin
 * @param {{ date: string, rates: Record<string, number> }} ecb
 * @returns {{ country_code: string, fuel: string, price: number, currency: string, price_eur: number, bulletin_date: string, exchange_rate_date: string }[]}
 */
export function toFuelRows(bulletin, ecb) {
  return bulletin.prices.flatMap(({ country, fuel, eurPerLitre }) => {
    const currency = SUPPORTED_COUNTRIES[country]?.currency;
    const rate = ecb.rates[currency];
    if (!currency || !rate) return [];
    return [
      {
        country_code: country,
        fuel,
        price: Math.round(eurPerLitre * rate * 1000) / 1000,
        currency,
        price_eur: eurPerLitre,
        bulletin_date: bulletin.bulletinDate,
        exchange_rate_date: ecb.date
      }
    ];
  });
}
