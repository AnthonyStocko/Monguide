/**
 * Liens « Voir les avis » d'un restaurant : recherches publiques Google Maps
 * et Tripadvisor, et site du restaurant. Aucun appel réseau, aucune note
 * lue ni stockée : l'application ouvre ces adresses à l'extérieur
 * (src/platform/externalUrl.js).
 *
 * Le nom cherché est le nom d'origine du lieu (place.name), jamais sa
 * traduction (displayName) : c'est lui qui figure sur les fiches Google et
 * Tripadvisor. Les tuiles OSM ne gardent pas l'adresse (addr:*) : la rue
 * n'est connue que si l'appelant la fournit ; la ville est celle de la
 * destination du séjour.
 */

/** Catégories de lieux qui ont des avis de restaurant. */
export const REVIEW_CATEGORIES = Object.freeze(['restaurant']);

/** Recherche Tripadvisor (format /Search?q=, non documenté par Tripadvisor). */
const TRIPADVISOR_SEARCH = (domain) => `https://www.tripadvisor.${domain}/Search?q=`;

const clean = (value) => (typeof value === 'string' ? value.trim() : '');
const coord = (value) => String(Math.round(value * 1e5) / 1e5);

/** true si le lieu peut afficher « Voir les avis » (pas un lieu sans nom). */
export function hasReviewLinks(place) {
  return Boolean(place && REVIEW_CATEGORIES.includes(place.category) && !place.unnamed && clean(place.name));
}

/**
 * @param {import('./model.js').Place} place
 * @param {string} uiLanguage langue de l'interface ("fr", "en", "fr-FR"…)
 * @param {{ city?: string, street?: string }} [where] ville (destination du séjour) et rue si connues
 * @returns {{ google: string, tripadvisor: string, website?: string }}
 */
export function reviewLinks(place, uiLanguage, { city, street } = {}) {
  const name = clean(place.name);
  const town = clean(city);
  const road = clean(street);
  const googleQuery = town
    ? [name, road, town].filter(Boolean).join(', ')
    : `${name} ${coord(place.lat)},${coord(place.lon)}`;
  const domain = /^fr\b/i.test(uiLanguage ?? '') ? 'fr' : 'com';
  const links = {
    google: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(googleQuery)}`,
    tripadvisor: `${TRIPADVISOR_SEARCH(domain)}${encodeURIComponent([name, town].filter(Boolean).join(' '))}`
  };
  const website = clean(place.food?.website ?? place.url);
  if (/^https?:\/\/\S+$/i.test(website)) links.website = website;
  return links;
}
