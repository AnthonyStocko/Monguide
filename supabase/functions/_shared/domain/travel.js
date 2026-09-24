import { distanceKm } from './geo.js';

/**
 * Paramètres de déplacement par mode (rules.travel.modes) et estimation des
 * trajets : distance à vol d'oiseau × coefficient de détour / vitesse. Ce
 * sont toujours des estimations.
 */

/**
 * Rayon effectif d'exploration : celui du mode, sans dépasser le rayon choisi.
 * @param {'walk' | 'transit' | 'bike' | 'car'} mode
 * @param {number} tripRadiusKm rayon choisi à l'étape 1
 */
export function effectiveRadiusKm(mode, tripRadiusKm, rules) {
  const modeRadius = rules.travel.modes[mode]?.radiusKm;
  return modeRadius == null ? tripRadiusKm : Math.min(modeRadius, tripRadiusKm);
}

/** Distance estimée par la route (km) entre deux points. */
export function routeKm(a, b, rules) {
  return distanceKm(a, b) * rules.travel.detourFactor;
}

/**
 * Temps de trajet estimé, en minutes entières (arrondi au-dessus).
 * @param {{ lat: number, lon: number }} a
 * @param {{ lat: number, lon: number }} b
 * @param {'walk' | 'transit' | 'bike' | 'car'} mode
 */
export function travelMinutes(a, b, mode, rules) {
  const km = routeKm(a, b, rules);
  return km === 0 ? 0 : Math.ceil((km / rules.travel.modes[mode].speedKmh) * 60);
}
