/**
 * Pays pris en charge. Chaque séjour enregistre le pays, le fuseau et la
 * monnaie de sa destination : ces valeurs viennent d'ici, jamais du code.
 * Phase 2 : France métropolitaine uniquement. La phase 2 bis ajoute les
 * autres pays européens (fournisseur "eu") et le fuseau selon la position
 * pour les pays qui en ont plusieurs.
 */
export const SUPPORTED_COUNTRIES = Object.freeze({
  FR: Object.freeze({ timezone: 'Europe/Paris', currency: 'EUR', provider: 'fr' })
});

/**
 * @param {string} countryCode code ISO 3166-1 alpha-2, casse indifférente
 * @returns {{ code: string, timezone: string, currency: string, provider: string } | null}
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
