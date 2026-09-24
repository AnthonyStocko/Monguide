import { classifyIndoor } from '../domain/classifyIndoor.js';

/** Valeurs "historic" retenues comme petit patrimoine. */
export const SMALL_HERITAGE_HISTORIC = ['wayside_cross', 'memorial', 'ruins'];

/**
 * Catégorie Mon guide d'un élément OSM d'après ses tags, et le type utilisé
 * pour la classification intérieur/extérieur.
 * @param {Record<string, string>} tags
 * @returns {{ category: import('../domain/model.js').PlaceCategory, type: string } | null}
 */
export function osmCategory(tags) {
  if (tags.amenity === 'restaurant') return { category: 'restaurant', type: 'restaurant' };
  if (tags.amenity === 'marketplace') return { category: 'market', type: tags.covered === 'yes' ? 'covered market' : 'marketplace' };
  if (tags.shop === 'farm') return { category: 'farm', type: 'farm' };
  if (tags.leisure === 'park') return { category: 'park', type: 'park' };
  if (tags.boundary === 'protected_area') return { category: 'nature', type: 'protected_area' };
  if (tags.tourism === 'viewpoint') return { category: 'viewpoint', type: 'viewpoint' };
  if (SMALL_HERITAGE_HISTORIC.includes(tags.historic)) return { category: 'small_heritage', type: tags.historic };
  // Le lavoir est étiqueté amenity=lavoir dans OSM ; man_made=lavoir existe aussi.
  if (tags.amenity === 'lavoir' || tags.man_made === 'lavoir') return { category: 'small_heritage', type: 'lavoir' };
  return null;
}

const YES_ONLY = ['yes', 'only'];
const WHEELCHAIR = ['yes', 'limited', 'no'];

/**
 * Champ food d'un restaurant, à partir de ses tags OSM.
 * @param {Record<string, string>} tags
 * @param {string[]} regionalCuisines rules.places.regionalCuisines
 * @returns {import('../domain/model.js').PlaceFood}
 */
export function osmFood(tags, regionalCuisines) {
  const cuisine = (tags.cuisine ?? '')
    .split(';')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  let vegetarian;
  if (YES_ONLY.includes(tags['diet:vegetarian']) || YES_ONLY.includes(tags['diet:vegan'])) vegetarian = true;
  else if (tags['diet:vegetarian'] === 'no') vegetarian = false;

  const food = { regional: cuisine.some((c) => regionalCuisines.includes(c)) };
  if (cuisine.length) food.cuisine = cuisine;
  if (tags.opening_hours) food.openingHours = tags.opening_hours;
  if (WHEELCHAIR.includes(tags.wheelchair)) food.wheelchair = tags.wheelchair;
  if (vegetarian !== undefined) food.vegetarian = vegetarian;
  const phone = tags.phone ?? tags['contact:phone'];
  if (phone) food.phone = phone;
  const website = tags.website ?? tags['contact:website'];
  if (website) food.website = website;
  return food;
}

/**
 * Convertit un élément Overpass (node, way ou relation avec "out center")
 * en Place ; null s'il n'a pas de nom, de position ou de catégorie connue.
 * @param {{ type: string, id: number, lat?: number, lon?: number, center?: { lat: number, lon: number }, tags?: Record<string, string> }} element
 * @param {{ lang: string, regionalCuisines: string[] }} options
 * @returns {import('../domain/model.js').Place | null}
 */
export function osmElementToPlace(element, { lang, regionalCuisines }) {
  const tags = element.tags ?? {};
  const name = (tags[`name:${lang}`] ?? tags.name ?? '').trim();
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const kind = osmCategory(tags);
  if (!name || !kind || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  /** @type {import('../domain/model.js').Place} */
  const place = {
    id: `osm:${element.type}/${element.id}`,
    name,
    category: kind.category,
    lat,
    lon,
    source: 'osm',
    certified: false,
    indoor: classifyIndoor({ category: kind.category, name, type: kind.type })
  };
  const website = tags.website ?? tags['contact:website'];
  if (website) place.url = website;
  if (tags.description) place.description = tags.description;
  if (kind.category === 'restaurant') place.food = osmFood(tags, regionalCuisines);
  return place;
}
