import { distanceKm } from './geo.js';

const normalizeName = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Identifiant Wikidata d'un lieu : son champ wikidata, ou son id "wikidata:Q…". */
const wikidataOf = (p) => p.wikidata ?? (p.id.startsWith('wikidata:') ? p.id.slice('wikidata:'.length) : undefined);

/**
 * Supprime les doublons entre sources, dans cet ordre :
 *  1. même identifiant de lieu ;
 *  2. même identifiant Wikidata (ex. un lieu OSM tagué wikidata=Q… et
 *     l'élément Wikidata correspondant), quelle que soit la distance ;
 *  3. même nom (sans accents ni casse) à moins de `maxDistanceM` mètres.
 * Les lieux certifiés sont gardés en priorité ; l'ordre d'origine est
 * conservé sinon.
 * @template {{ id: string, name: string, lat: number, lon: number, certified: boolean, wikidata?: string }} P
 * @param {P[]} places
 * @param {number} maxDistanceM rules.places.dedupDistanceM
 * @returns {P[]}
 */
export function dedupePlaces(places, maxDistanceM) {
  const ordered = [...places].sort((a, b) => Number(b.certified) - Number(a.certified));
  /** @type {P[]} */
  const kept = [];
  const ids = new Set();
  const qids = new Set();
  for (const place of ordered) {
    if (ids.has(place.id)) continue;
    const qid = wikidataOf(place);
    if (qid && qids.has(qid)) continue;
    const name = normalizeName(place.name);
    const duplicate = kept.some(
      (k) => normalizeName(k.name) === name && distanceKm(k, place) * 1000 <= maxDistanceM
    );
    if (duplicate) continue;
    ids.add(place.id);
    if (qid) qids.add(qid);
    kept.push(place);
  }
  const keptSet = new Set(kept);
  return places.filter((p) => keptSet.has(p));
}
