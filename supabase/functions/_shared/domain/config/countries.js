/**
 * Pays pris en charge, utilisés par le serveur (choix du fournisseur de
 * données) et par l'application (filtrage de la recherche de destination).
 * Pour ajouter un pays : une ligne { currency, provider, languages }.
 *
 * - currency : code ISO 4217 de la monnaie du pays ;
 * - provider : fournisseur de données ("fr" pour la France, "eu" pour les
 *   autres pays) ;
 * - languages : langues locales, pour les noms de lieux quand ils n'existent
 *   pas dans la langue de l'interface ni en anglais ;
 * - dinnerTime (facultatif) : heure habituelle du dîner "HH:mm", à la place
 *   de rules.dayTemplate.dinner (19:30). Valeurs modifiables ici.
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
  ES: { currency: 'EUR', provider: 'eu', languages: ['es', 'ca', 'eu', 'gl'], dinnerTime: '21:00' },
  FI: { currency: 'EUR', provider: 'eu', languages: ['fi', 'sv'] },
  FR: { currency: 'EUR', provider: 'fr', languages: ['fr'] },
  GR: { currency: 'EUR', provider: 'eu', languages: ['el'] },
  HR: { currency: 'EUR', provider: 'eu', languages: ['hr'] },
  HU: { currency: 'HUF', provider: 'eu', languages: ['hu'] },
  IE: { currency: 'EUR', provider: 'eu', languages: ['en', 'ga'] },
  IT: { currency: 'EUR', provider: 'eu', languages: ['it'], dinnerTime: '20:00' },
  LT: { currency: 'EUR', provider: 'eu', languages: ['lt'] },
  LU: { currency: 'EUR', provider: 'eu', languages: ['lb', 'fr', 'de'] },
  LV: { currency: 'EUR', provider: 'eu', languages: ['lv'] },
  MT: { currency: 'EUR', provider: 'eu', languages: ['mt', 'en'] },
  NL: { currency: 'EUR', provider: 'eu', languages: ['nl'] },
  PL: { currency: 'PLN', provider: 'eu', languages: ['pl'] },
  PT: { currency: 'EUR', provider: 'eu', languages: ['pt'], dinnerTime: '20:00' },
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
 * Langues des variantes de noms de lieux conservées (Place.names, tuiles
 * OSM v2) quel que soit le pays : langues de l'interface et grandes langues
 * de voyage. S'y ajoutent les langues des pays concernés (nameLanguages).
 */
export const BASE_NAME_LANGUAGES = Object.freeze(['fr', 'en', 'nl', 'de', 'it', 'es', 'ca', 'eu', 'pt']);

/**
 * Langues de noms utiles pour une liste de pays : BASE_NAME_LANGUAGES plus
 * leurs langues locales (champ languages), triées, sans doublon. Un code
 * inconnu est ignoré.
 * @param {readonly string[]} countryCodes
 * @returns {string[]}
 */
export function nameLanguages(countryCodes) {
  const all = new Set(BASE_NAME_LANGUAGES);
  for (const code of countryCodes) for (const lang of countryInfo(code)?.languages ?? []) all.add(lang);
  return [...all].sort();
}

/**
 * @param {string} countryCode code ISO 3166-1 alpha-2, casse indifférente
 * @returns {{ code: string, currency: string, provider: string, languages: string[], dinnerTime?: string } | null}
 */
export function countryInfo(countryCode) {
  if (typeof countryCode !== 'string') return null;
  const code = countryCode.toUpperCase();
  const info = SUPPORTED_COUNTRIES[code];
  return info ? { code, ...info } : null;
}

/**
 * Heure du dîner proposée dans un pays : dinnerTime du pays, sinon
 * rules.dayTemplate.dinner.
 * @param {string} countryCode
 * @returns {string} "HH:mm"
 */
export function dinnerTimeFor(countryCode, rules) {
  return countryInfo(countryCode)?.dinnerTime ?? rules.dayTemplate.dinner;
}

/** @param {string} countryCode */
export function isSupportedCountry(countryCode) {
  return countryInfo(countryCode) !== null;
}
