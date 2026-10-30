/**
 * Réservation pour les groupes (fonction pure, calculée à l'affichage : elle
 * suit le nombre de voyageurs du séjour). À partir de
 * rules.groups.bookAheadFrom voyageurs, chaque restaurant porte « Pensez à
 * réserver » ; les dîners des jours de forte affluence
 * (rules.groups.busyDinnerDays : vendredi et samedi) sont mis en avant et
 * font l'objet d'un rappel la veille (notificationPlan.js).
 */

/** Jour de la semaine d'une date "YYYY-MM-DD" (0 = dimanche … 6 = samedi), sans fuseau. */
const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();

/**
 * @param {{ travelers: number }} trip
 * @param {string} date jour de l'étape
 * @param {{ type: string, place?: { category: string } }} step
 * @returns {{ highlight: boolean } | null} null : aucun conseil ; highlight : dîner d'un jour chargé
 */
export function bookingAdvice(trip, date, step, rules) {
  if (step.place?.category !== 'restaurant') return null;
  if (!(trip.travelers >= rules.groups.bookAheadFrom)) return null;
  return { highlight: step.type === 'dinner' && rules.groups.busyDinnerDays.includes(weekday(date)) };
}
