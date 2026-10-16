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

const RELATIVE_STEPS = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY]
];

/**
 * Heure relative (« il y a 5 minutes », « hier »).
 * @param {Date | string | number} value
 * @param {string} locale
 * @param {number} [now] horodatage de référence (tests)
 */
export function formatRelative(value, locale, now = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  let amount = (date.getTime() - now) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (Math.abs(amount) < 45) return rtf.format(0, 'second');
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(amount) < size) return rtf.format(Math.round(amount), unit);
    amount /= size;
  }
  return rtf.format(Math.round(amount), 'year');
}
