import { distanceKm } from './geo.js';

const normalizeName = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Supprime les doublons entre sources : même identifiant, ou même nom
 * (sans accents ni casse) à moins de `maxDistanceM` mètres. Les lieux
 * certifiés sont gardés en priorité ; l'ordre d'origine est conservé sinon.
 * @template {{ id: string, name: string, lat: number, lon: number, certified: boolean }} P
 * @param {P[]} places
 * @param {number} maxDistanceM rules.places.dedupDistanceM
 * @returns {P[]}
 */
export function dedupePlaces(places, maxDistanceM) {
  const ordered = [...places].sort((a, b) => Number(b.certified) - Number(a.certified));
  /** @type {P[]} */
  const kept = [];
  const ids = new Set();
  for (const place of ordered) {
    if (ids.has(place.id)) continue;
    const name = normalizeName(place.name);
    const duplicate = kept.some(
      (k) => normalizeName(k.name) === name && distanceKm(k, place) * 1000 <= maxDistanceM
    );
    if (duplicate) continue;
    ids.add(place.id);
    kept.push(place);
  }
  const keptSet = new Set(kept);
  return places.filter((p) => keptSet.has(p));
}
