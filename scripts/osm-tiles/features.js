import { roundCoord } from '../../supabase/functions/_shared/domain/geo.js';
import { osmCategory } from '../../supabase/functions/_shared/services/osmMapping.js';
import { pointOnSurface } from './pointOnSurface.js';

/**
 * Conversion d'un objet exporté par osmium (GeoJSON) en lieu compact de
 * tuile : [id, category, subcategory, name, lat, lon, tags]
 * (docs/osm-tiles.md). La classification réutilise osmCategory, celle de la
 * lecture : un lieu est classé de la même façon à la génération et à la
 * lecture.
 */

/** Catégories dont les objets sans nom sont gardés (filtrés ensuite par rules.osm.unnamedTypes). */
export const UNNAMED_CATEGORIES = ['small_heritage', 'viewpoint'];

/**
 * Tags conservés, dans cet ordre (sortie déterministe). name:fr et name:en
 * servent au nom dans la langue de l'application (osmElementToPlace lit
 * name:<lang> avant name), description au Place : les deux figuraient dans
 * l'étude des volumes.
 */
const KEPT_TAGS = ['cuisine', 'opening_hours', 'wheelchair', 'diet:vegetarian', 'diet:vegan', 'phone', 'website', 'wikidata', 'heritage', 'description'];
const NAME_TAGS = ['name:fr', 'name:en'];

const isHeritageListed = (tags) => tags.heritage === '1' || tags.heritage === '2';

/**
 * Identifiant "n123", "w456" ou "r789". osmium export -u type_id donne
 * directement ce format ; par précaution, un identifiant de surface ("a…",
 * 2 × id du chemin, ou 2 × id de la relation + 1) est ramené à son objet
 * d'origine.
 * @param {string | undefined} raw
 * @returns {string | null}
 */
export function osmId(raw) {
  const match = /^([nwra])(\d+)$/.exec(raw ?? '');
  if (!match) return null;
  if (match[1] !== 'a') return `${match[1]}${match[2]}`;
  const areaId = Number(match[2]);
  return areaId % 2 === 0 ? `w${areaId / 2}` : `r${(areaId - 1) / 2}`;
}

/**
 * Catégorie et sous-catégorie d'un objet d'après ses tags.
 * @param {Record<string, string>} tags
 * @param {{ heritageFallback: boolean }} options
 * @returns {{ category: string, subcategory: string } | null}
 */
export function classify(tags, { heritageFallback }) {
  if (heritageFallback) {
    if (tags.tourism === 'museum') return { category: 'museum', subcategory: 'museum' };
    if (isHeritageListed(tags)) return { category: 'monument', subcategory: tags.historic ?? tags.building ?? tags.amenity ?? 'monument' };
  }
  const kind = osmCategory(tags);
  if (!kind) return null;
  return { category: kind.category, subcategory: kind.type === 'covered market' ? 'covered_market' : kind.type };
}

/**
 * Tags utiles présents, contact:phone et contact:website ramenés à phone et
 * website (la valeur directe l'emporte).
 * @param {Record<string, string>} tags
 */
export function pickTags(tags) {
  const source = { ...tags, phone: tags.phone ?? tags['contact:phone'], website: tags.website ?? tags['contact:website'] };
  const out = {};
  for (const key of KEPT_TAGS) {
    const value = source[key]?.trim();
    if (value) out[key] = value;
  }
  const name = tags.name?.trim();
  for (const key of NAME_TAGS) {
    const value = tags[key]?.trim();
    if (value && value !== name) out[key] = value;
  }
  return out;
}

/**
 * @param {{ id?: string, geometry: any, properties?: Record<string, string> }} feature
 * @param {{ heritageFallback: boolean }} options
 * @returns {[string, string, string, string | null, number, number, Record<string, string>] | null}
 */
export function featureToEntry(feature, options) {
  const tags = feature.properties ?? {};
  const kind = classify(tags, options);
  if (!kind) return null;
  const id = osmId(feature.id ?? (tags['@type'] && `${tags['@type'][0]}${tags['@id']}`));
  if (!id) return null;
  const name = tags.name?.trim() || null;
  const named = name || NAME_TAGS.some((key) => tags[key]?.trim());
  if (!named && !UNNAMED_CATEGORIES.includes(kind.category)) return null;
  const point = pointOnSurface(feature.geometry);
  if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
  return [id, kind.category, kind.subcategory, name, roundCoord(point[1], 5), roundCoord(point[0], 5), pickTags(tags)];
}

/**
 * Ordre des lieux dans une tuile : type (n, r, w, ordre alphabétique) puis
 * identifiant numérique.
 * @param {[string, ...unknown[]]} a
 * @param {[string, ...unknown[]]} b
 */
export function compareEntries(a, b) {
  if (a[0][0] !== b[0][0]) return a[0][0] < b[0][0] ? -1 : 1;
  return Number(a[0].slice(1)) - Number(b[0].slice(1));
}
