import { distanceKm } from './geo.js';

/**
 * Lieux sur lesquels l'agent Instagram a commenté un post (publié à la main
 * par Anthony). Fonctions pures : lecture défensive de la liste de l'agent et
 * correspondance avec un lieu d'un séjour. Les deux applications restent
 * séparées : la liste vient d'un appel HTTP en lecture seule (voir
 * services/instagramAgent.js), jamais d'un accès à la base de l'agent.
 *
 * @typedef {object} InstagramPlace
 * @property {string} url adresse permanente du post (https://www.instagram.com/p/…)
 * @property {string} [account] compte Instagram du post
 * @property {string} name nom du lieu
 * @property {string} [city] ville
 * @property {number} [lat]
 * @property {number} [lon]
 * @property {string} [placeId] identifiant de lieu (id Mon guide, "wikidata:Q…" ou identifiant Wikidata nu)
 * @property {string} [postedAt] date ISO du commentaire publié, pour retenir le plus récent
 */

/** Nombre maximal de lieux gardés (la liste de l'agent est une entrée externe). */
export const MAX_INSTAGRAM_PLACES = 2000;

/** Distance maximale (km) entre le lieu du post et l'étape pour un même nom. */
export const MAX_MATCH_DISTANCE_KM = 2;

/** Mots vides ignorés dans la comparaison des noms (articles, « de », « et »). */
const STOP_WORDS = new Set(['le', 'la', 'les', 'l', 'un', 'une', 'de', 'du', 'des', 'd', 'et']);

/**
 * Nom comparable : sans accents ni casse, tirets et apostrophes comme espaces,
 * sans articles ni mots vides (« Le Mont-Saint-Michel » = « mont saint michel »).
 * @param {unknown} value
 * @returns {string} chaîne vide si rien d'exploitable
 */
export function normalizeName(value) {
  if (typeof value !== 'string') return '';
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word && !STOP_WORDS.has(word))
    .join(' ');
}

/** Un post Instagram : adresse https du site, chemin /p/, /reel/ ou /tv/. */
const POST_URL = /^https:\/\/(www\.)?instagram\.com\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?(\?[^\s#]*)?$/;

const isCoord = (value, max) => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= max;
const text = (value, max) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : undefined);

/**
 * Lit la réponse de l'agent ({ places: [...] }) sans jamais lever d'erreur :
 * les entrées invalides (adresse qui n'est pas un post Instagram, nom absent)
 * sont ignorées, les champs inconnus supprimés.
 * @param {unknown} raw
 * @returns {InstagramPlace[]}
 */
export function parseInstagramPlaces(raw) {
  const list = Array.isArray(raw?.places) ? raw.places : [];
  /** @type {InstagramPlace[]} */
  const places = [];
  for (const item of list.slice(0, MAX_INSTAGRAM_PLACES)) {
    if (!item || typeof item !== 'object') continue;
    const url = text(item.url, 300);
    const name = text(item.name, 200);
    if (!url || !POST_URL.test(url) || !name || !normalizeName(name)) continue;
    const entry = { url, name };
    const account = text(item.account, 60);
    const city = text(item.city, 100);
    const placeId = text(item.placeId, 100);
    const postedAt = text(item.postedAt, 40);
    if (account) entry.account = account;
    if (city) entry.city = city;
    if (placeId) entry.placeId = placeId;
    if (postedAt && Number.isFinite(Date.parse(postedAt))) entry.postedAt = postedAt;
    if (isCoord(item.lat, 90) && isCoord(item.lon, 180)) {
      entry.lat = item.lat;
      entry.lon = item.lon;
    }
    places.push(entry);
  }
  return places;
}

/**
 * Le post concerne-t-il ce lieu ? Par ordre de fiabilité :
 *  1. identifiant commun (id du lieu ou identifiant Wikidata) ;
 *  2. même nom normalisé, ET même endroit : coordonnées à moins de
 *     MAX_MATCH_DISTANCE_KM ou, sans coordonnées, même ville que la
 *     destination du séjour. Un nom seul ne suffit jamais (homonymes).
 * @param {{ id?: string, name?: string, lat?: number, lon?: number, wikidata?: string }} place lieu de l'étape
 * @param {InstagramPlace} post
 * @param {string} [city] ville de destination du séjour
 */
export function postMatchesPlace(place, post, city) {
  if (post.placeId) {
    const wikidata = place.wikidata ?? (place.id?.startsWith('wikidata:') ? place.id.slice('wikidata:'.length) : undefined);
    if (post.placeId === place.id || (wikidata && (post.placeId === wikidata || post.placeId === `wikidata:${wikidata}`))) return true;
  }
  const name = normalizeName(place.name);
  if (!name || name !== normalizeName(post.name)) return false;
  if (post.lat !== undefined && post.lon !== undefined && isCoord(place.lat, 90) && isCoord(place.lon, 180)) {
    return distanceKm({ lat: place.lat, lon: place.lon }, { lat: post.lat, lon: post.lon }) <= MAX_MATCH_DISTANCE_KM;
  }
  const postCity = normalizeName(post.city);
  return Boolean(postCity) && postCity === normalizeName(city);
}

/**
 * Adresse du post le plus récent qui correspond au lieu (celui dont postedAt
 * est le plus tard ; sans date, le dernier de la liste ne passe qu'après les
 * posts datés).
 * @param {{ id?: string, name?: string, lat?: number, lon?: number, wikidata?: string } | null | undefined} place
 * @param {InstagramPlace[]} posts
 * @param {string} [city] ville de destination du séjour
 * @returns {string | null}
 */
export function findInstagramPost(place, posts, city) {
  if (!place || !Array.isArray(posts)) return null;
  let best = null;
  let bestTime = -Infinity;
  for (const post of posts) {
    if (!postMatchesPlace(place, post, city)) continue;
    const time = post.postedAt ? Date.parse(post.postedAt) : -1;
    if (best === null || time > bestTime) {
      best = post;
      bestTime = time;
    }
  }
  return best?.url ?? null;
}
