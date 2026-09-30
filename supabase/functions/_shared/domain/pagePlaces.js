import { distanceKm } from './geo.js';
import { PLACE_CATEGORIES } from './model.js';

/** Catégories acceptées par le paramètre categories de la fonction places (pas "personal"). */
export const SEARCHABLE_CATEGORIES = Object.freeze(PLACE_CATEGORIES.filter((c) => c !== 'personal'));

/**
 * Page de lieux pour le bouton « Plus de résultats » (fonction places) :
 * lieux des catégories demandées (toutes si absent), du plus proche au plus
 * éloigné du point de recherche (puis par identifiant : ordre stable d'une
 * page à l'autre), à partir de offset, rules.places.pageSize au plus.
 * @param {object[]} places
 * @param {{ point: { lat: number, lon: number }, categories?: string[], offset?: number }} options
 * @returns {{ places: object[], total: number, nextOffset: number | null }} nextOffset : null à la dernière page
 */
export function pagePlaces(places, { point, categories, offset = 0 }, rules) {
  const wanted = categories?.length ? new Set(categories) : null;
  const sorted = places
    .filter((p) => !wanted || wanted.has(p.category))
    .map((p) => ({ p, d: distanceKm(point, p) }))
    .sort((a, b) => a.d - b.d || (a.p.id < b.p.id ? -1 : a.p.id > b.p.id ? 1 : 0))
    .map(({ p }) => p);
  const end = offset + rules.places.pageSize;
  return { places: sorted.slice(offset, end), total: sorted.length, nextOffset: end < sorted.length ? end : null };
}
