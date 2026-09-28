import { classifyIndoor } from '../domain/classifyIndoor.js';
import { SUPPORTED_COUNTRIES, nameLanguages } from '../domain/config/countries.js';
import { nameVariants } from '../domain/displayName.js';

/** Langues des variantes de noms gardées dans Place.names : celles de tous les pays pris en charge. */
export const PLACE_NAME_LANGUAGES = Object.freeze(nameLanguages(Object.keys(SUPPORTED_COUNTRIES)));

/**
 * Nom d'un élément OSM : name tel quel (éventuellement bilingue), sinon la
 * variante de la langue demandée ; plus les variantes par langue qui en
 * diffèrent (Place.names, affichées par displayName). null sans nom dans la
 * langue demandée ni name.
 * localized, le nom dans la langue demandée, sert au classement intérieur/extérieur.
 * @param {Record<string, string>} tags
 * @param {string} lang
 * @returns {{ name: string, localized: string, names?: Record<string, string> } | null}
 */
export function osmNames(tags, lang) {
  const localized = (tags[`name:${lang}`] ?? tags.name ?? '').trim();
  if (!localized) return null;
  const name = tags.name?.trim() || localized;
  const names = nameVariants({ ...tags, name }, PLACE_NAME_LANGUAGES);
  return names ? { name, localized, names } : { name, localized };
}

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
  const naming = osmNames(tags, lang);
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  const kind = osmCategory(tags);
  if (!naming || !kind || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  /** @type {import('../domain/model.js').Place} */
  const place = {
    id: `osm:${element.type}/${element.id}`,
    name: naming.name,
    ...(naming.names ? { names: naming.names } : {}),
    category: kind.category,
    lat,
    lon,
    source: 'osm',
    certified: false,
    indoor: classifyIndoor({ category: kind.category, name: naming.localized, type: kind.type })
  };
  return withCommonTags(place, tags, kind.category === 'restaurant' ? osmFood(tags, regionalCuisines) : undefined);
}

/** Site web, description, identifiant Wikidata (dédoublonnage) et champ food. */
function withCommonTags(place, tags, food) {
  const website = tags.website ?? tags['contact:website'];
  if (website) place.url = website;
  if (tags.description) place.description = tags.description;
  if (/^Q\d+$/.test(tags.wikidata ?? '')) place.wikidata = tags.wikidata;
  if (food) place.food = food;
  return place;
}

/**
 * Repli OpenStreetMap du patrimoine (quand Wikidata échoue) : heritage=1 ou 2
 * -> monument protégé (certifié) ; tourism=museum -> musée (non certifié).
 * @param {{ type: string, id: number, lat?: number, lon?: number, center?: { lat: number, lon: number }, tags?: Record<string, string> }} element
 * @param {{ lang: string }} options
 * @returns {import('../domain/model.js').Place | null}
 */
export function osmHeritageElementToPlace(element, { lang }) {
  const tags = element.tags ?? {};
  const naming = osmNames(tags, lang);
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (!naming || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const name = naming.localized;
  const base = { id: `osm:${element.type}/${element.id}`, name: naming.name, ...(naming.names ? { names: naming.names } : {}), lat, lon, source: 'osm' };
  const type = tags.historic ?? tags.building ?? tags.amenity ?? '';
  if (tags.tourism === 'museum') {
    return withCommonTags({ ...base, category: 'museum', certified: false, indoor: classifyIndoor({ category: 'museum', name, type }) }, tags);
  }
  if (tags.heritage === '1' || tags.heritage === '2') {
    return withCommonTags(
      { ...base, category: 'monument', certified: true, certification: 'protected_heritage', indoor: classifyIndoor({ category: 'monument', name, type }) },
      tags
    );
  }
  return null;
}
