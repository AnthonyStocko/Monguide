import { distanceKm } from './geo.js';

const normalizeName = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Mots vides ignorés dans la comparaison des noms. */
const STOP_WORDS = new Set(['le', 'la', 'les', 'l', 'de', 'du', 'des', 'd', 'et', 'the', 'of', 'a', 'en', 'sur']);
const words = (name) => normalizeName(name).split(' ').filter((w) => w && !STOP_WORDS.has(w));

/**
 * Deux noms désignent-ils vraisemblablement le même lieu ? Identiques (sans
 * accents ni casse), l'un contenu dans l'autre ("Église Saint-Pierre" /
 * "Église Saint-Pierre de Villefranche"), ou au moins 60 % de mots communs.
 */
export function similarNames(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  if (Math.min(na.length, nb.length) >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  const wa = new Set(words(a));
  const wb = new Set(words(b));
  if (!wa.size || !wb.size) return false;
  const common = [...wa].filter((w) => wb.has(w)).length;
  return common / new Set([...wa, ...wb]).size >= 0.6;
}

/** Identifiant Wikidata d'un lieu : son champ wikidata, ou son id "wikidata:Q…". */
const wikidataOf = (p) => p.wikidata ?? (p.id.startsWith('wikidata:') ? p.id.slice('wikidata:'.length) : undefined);

/**
 * Supprime les doublons entre sources, dans cet ordre :
 *  1. même identifiant de lieu ;
 *  2. même identifiant Wikidata (ex. un lieu OSM tagué wikidata=Q… et
 *     l'élément Wikidata correspondant), quelle que soit la distance ;
 *  3. nom similaire (similarNames) à moins de `maxDistanceM` mètres.
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
    const duplicate = kept.some((k) => distanceKm(k, place) * 1000 <= maxDistanceM && similarNames(k.name, place.name));
    if (duplicate) continue;
    ids.add(place.id);
    if (qid) qids.add(qid);
    kept.push(place);
  }
  const keptSet = new Set(kept);
  return places.filter((p) => keptSet.has(p));
}
