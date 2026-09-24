/**
 * Arrondit une coordonnée (degrés). 2 décimales ≈ 1 km : précision utilisée
 * pour les clés de cache et les journaux, qui ne conservent jamais de
 * position exacte.
 * @param {number} value
 * @param {number} [decimals]
 * @returns {number}
 */
export function roundCoord(value, decimals = 2) {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}
