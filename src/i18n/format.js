/**
 * Formatage avec Intl dans la langue de l'interface. Pour les horaires d'un
 * séjour, passer options.timeZone = fuseau IANA du séjour.
 */

/**
 * @param {Date | string | number} value
 * @param {string} locale
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function formatDate(value, locale, options = { dateStyle: 'long' }) {
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * @param {number} value
 * @param {string} locale
 * @param {Intl.NumberFormatOptions} [options]
 */
export function formatNumber(value, locale, options) {
  return new Intl.NumberFormat(locale, options).format(value);
}

/**
 * Nom d'un pays dans la langue de l'interface ; le code lui-même s'il est inconnu.
 * @param {string} code code ISO 3166-1 alpha-2
 * @param {string} locale
 */
export function formatCountry(code, locale) {
  try {
    return new Intl.DisplayNames([locale], { type: 'region', fallback: 'code' }).of(code) ?? code;
  } catch {
    return code;
  }
}
