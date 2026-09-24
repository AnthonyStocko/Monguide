/**
 * Pays pris en charge, utilisés par le serveur (choix du fournisseur de
 * données) et par l'application (filtrage de la recherche de destination).
 * Pour ajouter un pays : une ligne { currency, provider, languages }.
 *
 * - currency : code ISO 4217 de la monnaie du pays ;
 * - provider : fournisseur de données ("fr" pour la France, "eu" pour les
 *   autres pays) ;
 * - languages : langues locales, pour les noms de lieux quand ils n'existent
 *   pas dans la langue de l'interface ni en anglais.
 *
 * Aucun fuseau horaire ici : il est déterminé par le serveur pour chaque
 * destination (plusieurs pays en ont plusieurs : Portugal, Espagne…).
 */
export const SUPPORTED_COUNTRIES = Object.freeze({
  // Union européenne (27)
  AT: { currency: 'EUR', provider: 'eu', languages: ['de'] },
  BE: { currency: 'EUR', provider: 'eu', languages: ['nl', 'fr', 'de'] },
  BG: { currency: 'EUR', provider: 'eu', languages: ['bg'] },
  CY: { currency: 'EUR', provider: 'eu', languages: ['el', 'tr'] },
  CZ: { currency: 'CZK', provider: 'eu', languages: ['cs'] },
  DE: { currency: 'EUR', provider: 'eu', languages: ['de'] },
  DK: { currency: 'DKK', provider: 'eu', languages: ['da'] },
  EE: { currency: 'EUR', provider: 'eu', languages: ['et'] },
  ES: { currency: 'EUR', provider: 'eu', languages: ['es', 'ca', 'eu', 'gl'] },
  FI: { currency: 'EUR', provider: 'eu', languages: ['fi', 'sv'] },
  FR: { currency: 'EUR', provider: 'fr', languages: ['fr'] },
  GR: { currency: 'EUR', provider: 'eu', languages: ['el'] },
  HR: { currency: 'EUR', provider: 'eu', languages: ['hr'] },
  HU: { currency: 'HUF', provider: 'eu', languages: ['hu'] },
  IE: { currency: 'EUR', provider: 'eu', languages: ['en', 'ga'] },
  IT: { currency: 'EUR', provider: 'eu', languages: ['it'] },
  LT: { currency: 'EUR', provider: 'eu', languages: ['lt'] },
  LU: { currency: 'EUR', provider: 'eu', languages: ['lb', 'fr', 'de'] },
  LV: { currency: 'EUR', provider: 'eu', languages: ['lv'] },
  MT: { currency: 'EUR', provider: 'eu', languages: ['mt', 'en'] },
  NL: { currency: 'EUR', provider: 'eu', languages: ['nl'] },
  PL: { currency: 'PLN', provider: 'eu', languages: ['pl'] },
  PT: { currency: 'EUR', provider: 'eu', languages: ['pt'] },
  RO: { currency: 'RON', provider: 'eu', languages: ['ro'] },
  SE: { currency: 'SEK', provider: 'eu', languages: ['sv'] },
  SI: { currency: 'EUR', provider: 'eu', languages: ['sl'] },
  SK: { currency: 'EUR', provider: 'eu', languages: ['sk'] },
  // Hors Union européenne
  GB: { currency: 'GBP', provider: 'eu', languages: ['en', 'cy', 'gd'] },
  CH: { currency: 'CHF', provider: 'eu', languages: ['de', 'fr', 'it', 'rm'] },
  NO: { currency: 'NOK', provider: 'eu', languages: ['nb', 'nn'] },
  IS: { currency: 'ISK', provider: 'eu', languages: ['is'] },
  LI: { currency: 'CHF', provider: 'eu', languages: ['de'] }
});

/** Membres de l'Union européenne (couverts par le Bulletin pétrolier). */
export const EU_MEMBERS = Object.freeze(
  Object.keys(SUPPORTED_COUNTRIES).filter((c) => !['GB', 'CH', 'NO', 'IS', 'LI'].includes(c))
);

/**
 * @param {string} countryCode code ISO 3166-1 alpha-2, casse indifférente
 * @returns {{ code: string, currency: string, provider: string, languages: string[] } | null}
 */
export function countryInfo(countryCode) {
  if (typeof countryCode !== 'string') return null;
  const code = countryCode.toUpperCase();
  const info = SUPPORTED_COUNTRIES[code];
  return info ? { code, ...info } : null;
}

/** @param {string} countryCode */
export function isSupportedCountry(countryCode) {
  return countryInfo(countryCode) !== null;
}
