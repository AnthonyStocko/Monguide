/**
 * Score d'un lieu (0-100) pour un créneau :
 *  - proximité : 1 - distance / rayon effectif du mode (0 au-delà du rayon) ;
 *  - bonus si le lieu est certifié, seulement s'il est peu connu (notoriété
 *    sous rules.notoriety.notableScore) : pour un lieu connu, la notoriété
 *    mesure déjà son intérêt (un jardin célèbre sans label n'est pas
 *    distancé par un parc labellisé moins connu) ;
 *  - bonus de diversité : plein si la catégorie n'est pas encore utilisée
 *    dans le séjour, divisé par deux à chaque utilisation ;
 *  - notoriété : place.notoriety (0-100, scoring/notoriety.js) rapportée à 100,
 *    0 si inconnue, et 0 au-delà du rayon effectif (un lieu célèbre trop loin
 *    n'attire pas la journée hors de portée des restaurants) ;
 *  - malus si le lieu n'a pas de nom (nom générique, place.unnamed).
 * Pondérations : rules.generation.score.
 *
 * @param {{ certified: boolean, category: string, unnamed?: boolean, notoriety?: number }} place
 * @param {{ distanceKm: number, effectiveRadiusKm: number, categoryUses: number }} ctx
 * @returns {number}
 */
export function scorePlace(place, { distanceKm, effectiveRadiusKm, categoryUses }, rules) {
  const w = rules.generation.score;
  const proximity = Math.max(0, 1 - distanceKm / effectiveRadiusKm);
  const diversity = 0.5 ** Math.max(0, categoryUses);
  const score = w.proximity * proximity + (place.certified && (place.notoriety ?? 0) < rules.notoriety.notableScore ? w.certified : 0) + w.diversity * diversity + (proximity > 0 ? w.notoriety * ((place.notoriety ?? 0) / 100) : 0) - (place.unnamed ? w.unnamedPenalty : 0);
  return Math.round(Math.min(100, Math.max(0, score)) * 10) / 10;
}

/**
 * Écart de trajet (km) pour passer par un lieu entre deux points, utilisé
 * les journées de transition entre deux hébergements :
 * distance(départ, lieu) + distance(lieu, arrivée) - distance(départ, arrivée).
 */
export function detourKm(distance, from, place, to) {
  return distance(from, place) + distance(place, to) - distance(from, to);
}
