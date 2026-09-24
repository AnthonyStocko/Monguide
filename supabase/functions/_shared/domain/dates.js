/**
 * Dates calendaires "YYYY-MM-DD", sans heure ni fuseau : l'arithmétique se
 * fait en UTC pour ne jamais dépendre du fuseau de l'appareil.
 */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * @param {unknown} value
 * @returns {boolean} true pour une date calendaire valide "YYYY-MM-DD"
 */
export function isValidDate(value) {
  if (typeof value !== 'string') return false;
  const m = value.match(DATE_RE);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

/**
 * @param {string} date "YYYY-MM-DD"
 * @param {number} days peut être négatif
 * @returns {string}
 */
export function addDays(date, days) {
  if (!isValidDate(date)) throw new RangeError(`Date invalide : ${date}`);
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Nombre de jours de a à b (négatif si b est avant a).
 * @param {string} a
 * @param {string} b
 */
export function daysBetween(a, b) {
  if (!isValidDate(a) || !isValidDate(b)) throw new RangeError(`Date invalide : ${a} / ${b}`);
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * Toutes les dates de start à end inclus.
 * @param {string} start
 * @param {string} end
 * @returns {string[]}
 */
export function eachDate(start, end) {
  const n = daysBetween(start, end);
  return n < 0 ? [] : Array.from({ length: n + 1 }, (_, i) => addDays(start, i));
}

/**
 * Date du jour dans un fuseau horaire (celui de la destination, pas celui de
 * l'appareil).
 * @param {string} timeZone IANA
 * @param {Date} [now]
 * @returns {string} "YYYY-MM-DD"
 */
export function todayIn(timeZone, now = new Date()) {
  // en-CA formate les dates en "YYYY-MM-DD".
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * @param {unknown} timeZone
 * @returns {boolean} true pour un fuseau IANA reconnu
 */
export function isValidTimeZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}
