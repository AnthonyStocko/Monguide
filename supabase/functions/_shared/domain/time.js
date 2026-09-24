/**
 * Heures "HH:mm" dans le fuseau du séjour, manipulées en minutes depuis
 * minuit : aucune conversion en instant réel, aucun fuseau de l'appareil.
 */

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** @param {string} hhmm @returns {number} minutes depuis minuit */
export function toMinutes(hhmm) {
  const m = HHMM.exec(hhmm ?? '');
  if (!m) throw new RangeError(`Heure invalide : ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

/** @param {number} minutes depuis minuit (0 à 1439) @returns {string} "HH:mm" */
export function fromMinutes(minutes) {
  const m = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Heures pleines "HH" couvertes par un créneau [start, end[ (météo heure par heure).
 * @param {string} start
 * @param {string} end
 * @returns {string[]}
 */
export function hoursCovered(start, end) {
  const from = Math.floor(toMinutes(start) / 60);
  const to = Math.ceil(toMinutes(end) / 60);
  const hours = [];
  for (let h = from; h < Math.max(to, from + 1); h += 1) hours.push(String(h).padStart(2, '0'));
  return hours;
}

/**
 * SECONDE exception autorisée à la règle "pas de new Date()" : la librairie
 * opening_hours lit l'heure LOCALE d'un objet Date (getHours, getDay…). On
 * construit donc un Date dont les champs locaux valent l'heure locale de la
 * destination (année, mois, jour, heure, minute). Ce Date ne représente pas
 * l'instant réel : il ne sert qu'à l'évaluation des horaires d'ouverture.
 * @param {string} date "YYYY-MM-DD", jour à destination
 * @param {string} time "HH:mm", heure à destination
 * @returns {Date}
 */
export function destinationLocalDate(date, time) {
  const [y, mo, d] = date.split('-').map(Number);
  const minutes = toMinutes(time);
  return new Date(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60, 0, 0);
}
