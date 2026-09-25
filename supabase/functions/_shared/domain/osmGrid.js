import { boundingBox, distanceKm } from './geo.js';

/**
 * Grille des tuiles de lieux OpenStreetMap (docs/osm-tiles.md) : cases de
 * cellDeg degrés de côté, repérées par iy = floor(lat / cellDeg) et
 * ix = floor(lon / cellDeg), nommées "iy_ix". Fonctions pures, partagées par
 * la fonction places (lecture) et par le script de génération des tuiles.
 *
 * Hors d'usage près de l'antiméridien (±180°) et des pôles : la grille ne
 * sert qu'aux pays européens.
 */

/**
 * Tolérance du floor : 45.6 / 0.2 vaut 227.99999999999997 en virgule
 * flottante, alors que 45.6 est le bord sud de la case 228.
 */
const EPSILON = 1e-9;

/**
 * Marge relative sur le rayon : la distance au point de la case le plus
 * proche est calculée en bornant latitude et longitude séparément, ce qui la
 * surestime très légèrement (moins d'un mètre à 40 km). On garde donc une
 * case de trop plutôt qu'une case manquante.
 */
const RADIUS_MARGIN = 1.001;

/**
 * Indice de case sur un axe. Math.floor, jamais une troncature : pour une
 * longitude de -1,5° et des cases de 0,2°, l'indice est -8 (Math.trunc
 * donnerait -7, la case voisine à l'est).
 * @param {number} deg
 * @param {number} cellDeg
 */
export function cellIndex(deg, cellDeg) {
  return Math.floor(deg / cellDeg + EPSILON);
}

/**
 * @param {number} iy
 * @param {number} ix
 * @returns {string} "iy_ix"
 */
export function formatTileId(iy, ix) {
  return `${iy}_${ix}`;
}

/**
 * @param {string} tileId "iy_ix"
 * @returns {{ iy: number, ix: number }}
 */
export function parseTileId(tileId) {
  const match = /^(-?\d+)_(-?\d+)$/.exec(tileId);
  if (!match) throw new Error(`identifiant de tuile invalide : ${tileId}`);
  return { iy: Number(match[1]), ix: Number(match[2]) };
}

/**
 * Case contenant un point.
 * @param {number} lat
 * @param {number} lon
 * @param {number} cellDeg
 * @returns {string} "iy_ix"
 */
export function tileIdForPoint(lat, lon, cellDeg) {
  return formatTileId(cellIndex(lat, cellDeg), cellIndex(lon, cellDeg));
}

/**
 * Limites d'une case, en degrés.
 * @param {string} tileId
 * @param {number} cellDeg
 */
export function tileBounds(tileId, cellDeg) {
  const { iy, ix } = parseTileId(tileId);
  return { minLat: iy * cellDeg, maxLat: (iy + 1) * cellDeg, minLon: ix * cellDeg, maxLon: (ix + 1) * cellDeg };
}

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Toutes les cases qui touchent le cercle de rayon radiusKm autour du point.
 * On parcourt les cases du rectangle englobant le cercle (plus large en
 * degrés de longitude qu'en latitude, le degré de longitude rétrécissant avec
 * la latitude), puis on ne garde que celles dont le point le plus proche du
 * centre est dans le rayon : les coins du rectangle sont écartés.
 * @param {number} lat
 * @param {number} lon
 * @param {number} radiusKm
 * @param {number} cellDeg
 * @returns {string[]} identifiants "iy_ix", triés du sud au nord puis d'ouest en est
 */
export function tileIdsForRadius(lat, lon, radiusKm, cellDeg) {
  const center = { lat, lon };
  const box = boundingBox(center, radiusKm);
  const ids = [];
  for (let iy = cellIndex(box.minLat, cellDeg); iy <= cellIndex(box.maxLat, cellDeg); iy++) {
    for (let ix = cellIndex(box.minLon, cellDeg); ix <= cellIndex(box.maxLon, cellDeg); ix++) {
      const nearest = {
        lat: clamp(lat, iy * cellDeg, (iy + 1) * cellDeg),
        lon: clamp(lon, ix * cellDeg, (ix + 1) * cellDeg)
      };
      if (distanceKm(center, nearest) <= radiusKm * RADIUS_MARGIN) ids.push(formatTileId(iy, ix));
    }
  }
  return ids;
}
