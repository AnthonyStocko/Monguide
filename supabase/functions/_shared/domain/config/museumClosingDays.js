/**
 * Jours de fermeture habituels des musées (0 = dimanche … 6 = samedi), par
 * pays de la destination : un musée aux horaires inconnus n'est jamais placé
 * ces jours-là (generateTrip.js, mustSee.js) et porte le badge
 * hours_unconfirmed (« Horaires à vérifier »). Sources consultées le
 * 2026-10-30 :
 *  - France : lundi ou mardi selon l'établissement (Louvre, Guimet,
 *    palais Rohan à Strasbourg, Mucem : mardi ; musées de la Ville de Paris,
 *    musées municipaux de Marseille, musée de la Musique : lundi) ; les deux
 *    jours sont évités ;
 *  - Belgique, Espagne, Italie : surtout le lundi (visit.brussels ;
 *    exceptions : Reina Sofía le mardi, grands musées d'État ouverts tous
 *    les jours) ;
 *  - autres pays : lundi par défaut (Grèce : aucune source officielle
 *    trouvée, à confirmer).
 */
export const DEFAULT_MUSEUM_CLOSING_DAYS = Object.freeze([1]);

export const MUSEUM_CLOSING_DAYS = Object.freeze({
  FR: Object.freeze([1, 2])
});

/**
 * Jours de fermeture habituels des musées d'un pays.
 * @param {string | undefined} countryCode
 * @returns {readonly number[]}
 */
export function museumClosingDays(countryCode) {
  return MUSEUM_CLOSING_DAYS[String(countryCode ?? '').toUpperCase()] ?? DEFAULT_MUSEUM_CLOSING_DAYS;
}
