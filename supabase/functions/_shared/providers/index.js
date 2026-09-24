import { countryInfo } from '../domain/countries.js';
import fr from './fr/index.js';

/** @type {Record<string, import('./types.js').CountryProvider>} */
const PROVIDERS = { fr };

/**
 * Fournisseur de données du pays de la destination ; null si le pays n'est
 * pas pris en charge. Aucun autre code ne sait quel fournisseur répond.
 * @param {string} countryCode ISO 3166-1 alpha-2
 * @returns {import('./types.js').CountryProvider | null}
 */
export function getProvider(countryCode) {
  const info = countryInfo(countryCode);
  return info ? PROVIDERS[info.provider] ?? null : null;
}
