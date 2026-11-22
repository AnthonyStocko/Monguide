import { ExternalError } from '../errors.js';
import { fetchExternalJson } from '../http.js';
import { log } from '../log.js';
import { ignReverseAddress, ignReverseCity, ignSearchAddresses, ignSearchCities } from './geocodingIgn.js';

/**
 * Recherche de destination avec Photon (photon.komoot.io, données
 * OpenStreetMap, sans clé). Nominatim n'est PAS utilisé : ses conditions
 * d'utilisation interdisent l'autocomplétion.
 *
 * L'instance publique de Photon est réservée à un usage raisonnable. Pour une
 * diffusion large, passer à une instance dédiée (auto-hébergée ou payante) :
 * il suffit de définir le secret PHOTON_URL, sans changer le code.
 *
 * SECOURS : si Photon est indisponible (panne, 5xx, ou 403/429 quand
 * l'instance publique refuse les serveurs Supabase), chaque recherche est
 * refaite auprès du géocodeur de l'IGN (services/geocodingIgn.js), qui ne
 * couvre que la France. Les résultats de secours sont repérables avec
 * isFallback(), pour ne les garder en cache que peu de temps.
 */
const PHOTON_URL = () => globalThis.Deno?.env.get('PHOTON_URL') ?? 'https://photon.komoot.io';

/** Langues acceptées par Photon parmi celles de l'application. */
const PHOTON_LANGS = ['fr', 'en'];

/**
 * @typedef {object} GeocodeResult
 * @property {string} name
 * @property {string} [region] département, province ou région
 * @property {string} country nom du pays, dans la langue demandée
 * @property {string} countryCode ISO 3166-1 alpha-2
 * @property {number} lat
 * @property {number} lon
 * @property {string | null} timezone IANA, ajouté par la fonction geocode (null si pays non pris en charge)
 */

/**
 * Convertit un résultat Photon ; null s'il ne s'agit pas d'une commune.
 * Les communes de TOUS les pays sont gardées : l'application signale celles
 * qui ne sont pas encore prises en charge (domain/config/countries.js).
 * @param {{ properties: Record<string, any>, geometry: { coordinates: [number, number] } }} feature
 * @returns {Omit<GeocodeResult, 'timezone'> | null}
 */
export function photonToResult(feature) {
  const p = feature?.properties ?? {};
  const [lon, lat] = feature?.geometry?.coordinates ?? [];
  if (p.type !== 'city' || !p.name || typeof p.countrycode !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const countryCode = p.countrycode.toUpperCase();
  const result = { name: p.name, country: p.country ?? countryCode, countryCode, lat, lon };
  const region = p.county ?? p.state;
  return region ? { ...result, region } : result;
}

/** Supprime les résultats répétés (même nom, même région, même pays). */
function unique(results) {
  const seen = new Set();
  return results.filter((r) => {
    const key = `${r.name}|${r.region ?? ''}|${r.countryCode}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function photonParams(lang) {
  // layer=city : villes, villages et hameaux uniquement.
  return { lang: PHOTON_LANGS.includes(lang) ? lang : 'default', layer: 'city' };
}

/**
 * @param {string} q texte saisi (3 caractères au moins)
 * @param {string} lang
 * @param {number} maxResults
 * @returns {Promise<GeocodeResult[]>}
 */
async function photonSearchCities(q, lang, maxResults) {
  // On demande plus de résultats que nécessaire : certains sont filtrés
  // (doublons, résultats qui ne sont pas des communes).
  const params = new URLSearchParams({ q, limit: String(maxResults * 2), ...photonParams(lang) });
  const json = await fetchExternalJson(`${PHOTON_URL()}/api/?${params}`, { source: 'photon' });
  return unique((json.features ?? []).map(photonToResult).filter(Boolean)).slice(0, maxResults);
}

/**
 * Recherche inverse : commune à une position ("Utiliser ma position").
 * @param {{ lat: number, lon: number }} point
 * @param {string} lang
 * @returns {Promise<GeocodeResult[]>} 0 ou 1 résultat
 */
async function photonReverseCity(point, lang) {
  const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon), limit: '1', ...photonParams(lang) });
  const json = await fetchExternalJson(`${PHOTON_URL()}/reverse?${params}`, { source: 'photon' });
  return (json.features ?? []).map(photonToResult).filter(Boolean).slice(0, 1);
}

/**
 * @typedef {object} AddressResult Adresse précise (hébergement).
 * @property {string} [name] nom du lieu s'il en a un (ex. "Hôtel du Parc")
 * @property {string} address adresse lisible ("12 Rue Royale, 74000 Annecy")
 * @property {string} countryCode ISO 3166-1 alpha-2
 * @property {number} lat
 * @property {number} lon
 */

/**
 * Convertit un résultat Photon en adresse ; null sans rue ni nom.
 * @param {{ properties: Record<string, any>, geometry: { coordinates: [number, number] } }} feature
 * @returns {AddressResult | null}
 */
export function photonToAddress(feature) {
  const p = feature?.properties ?? {};
  const [lon, lat] = feature?.geometry?.coordinates ?? [];
  if (typeof p.countrycode !== 'string' || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const place = [p.postcode?.trim(), p.city ?? p.town ?? p.village ?? p.county].filter(Boolean).join(' ');
  const address = [street || (p.type === 'street' ? p.name : ''), place].filter(Boolean).join(', ');
  if (!address) return null;
  const result = { address, countryCode: p.countrycode.toUpperCase(), lat, lon };
  return p.name && p.type !== 'street' ? { name: p.name, ...result } : result;
}

function uniqueAddresses(results) {
  const seen = new Set();
  return results.filter((r) => {
    const key = `${r.name ?? ''}|${r.address}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Recherche d'adresses et de lieux nommés (hôtels, gîtes…), favorisant ceux
 * proches de la destination.
 * @param {string} q
 * @param {string} lang
 * @param {number} maxResults
 * @param {{ lat: number, lon: number } | null} bias
 * @returns {Promise<AddressResult[]>}
 */
async function photonSearchAddresses(q, lang, maxResults, bias) {
  const params = new URLSearchParams([
    ['q', q],
    ['limit', String(maxResults * 2)],
    ['lang', PHOTON_LANGS.includes(lang) ? lang : 'default'],
    ['layer', 'house'],
    ['layer', 'street']
  ]);
  if (bias) {
    params.set('lat', String(bias.lat));
    params.set('lon', String(bias.lon));
  }
  const json = await fetchExternalJson(`${PHOTON_URL()}/api/?${params}`, { source: 'photon' });
  return uniqueAddresses((json.features ?? []).map(photonToAddress).filter(Boolean)).slice(0, maxResults);
}

/**
 * Adresse la plus proche d'une position ("Utiliser ma position", "Choisir
 * sur la carte").
 * @param {{ lat: number, lon: number }} point
 * @param {string} lang
 * @returns {Promise<AddressResult[]>} 0 ou 1 résultat
 */
async function photonReverseAddress(point, lang) {
  const params = new URLSearchParams([
    ['lat', String(point.lat)],
    ['lon', String(point.lon)],
    ['limit', '1'],
    ['lang', PHOTON_LANGS.includes(lang) ? lang : 'default'],
    ['layer', 'house'],
    ['layer', 'street']
  ]);
  const json = await fetchExternalJson(`${PHOTON_URL()}/reverse?${params}`, { source: 'photon' });
  return (json.features ?? []).map(photonToAddress).filter(Boolean).slice(0, 1);
}

/** Résultats obtenus par le secours (IGN), à ne pas garder longtemps en cache. */
const fallbackResults = new WeakSet();

/**
 * Les résultats viennent-ils du secours IGN (Photon indisponible) ?
 * @param {unknown} results
 */
export function isFallback(results) {
  return typeof results === 'object' && results !== null && fallbackResults.has(results);
}

/**
 * Appelle Photon ; s'il est indisponible, appelle le secours IGN. Une erreur
 * du secours est renvoyée telle quelle (502 external_unavailable).
 * @template T
 * @param {() => Promise<T[]>} primary
 * @param {() => Promise<T[]>} fallback
 * @returns {Promise<T[]>}
 */
async function withFallback(primary, fallback) {
  try {
    return await primary();
  } catch (err) {
    if (!(err instanceof ExternalError)) throw err;
    log('warn', 'geocode_fallback', { from: 'photon', to: 'ign', upstreamStatus: err.upstreamStatus, failure: err.failure });
    const results = await fallback();
    fallbackResults.add(results);
    return results;
  }
}

/**
 * Recherche de communes (3 caractères au moins).
 * @param {string} q
 * @param {string} lang
 * @param {number} maxResults
 * @returns {Promise<Omit<GeocodeResult, 'timezone'>[]>}
 */
export function searchCities(q, lang, maxResults) {
  return withFallback(
    () => photonSearchCities(q, lang, maxResults),
    () => ignSearchCities(q, lang, maxResults)
  );
}

/**
 * Commune à une position ("Utiliser ma position").
 * @param {{ lat: number, lon: number }} point
 * @param {string} lang
 */
export function reverseCity(point, lang) {
  return withFallback(
    () => photonReverseCity(point, lang),
    () => ignReverseCity(point, lang)
  );
}

/**
 * Adresses et lieux nommés, favorisant la destination.
 * @param {string} q
 * @param {string} lang
 * @param {number} maxResults
 * @param {{ lat: number, lon: number } | null} bias
 */
export function searchAddresses(q, lang, maxResults, bias) {
  return withFallback(
    () => photonSearchAddresses(q, lang, maxResults, bias),
    () => ignSearchAddresses(q, maxResults, bias)
  );
}

/**
 * Adresse la plus proche d'une position.
 * @param {{ lat: number, lon: number }} point
 * @param {string} lang
 */
export function reverseAddress(point, lang) {
  return withFallback(
    () => photonReverseAddress(point, lang),
    () => ignReverseAddress(point)
  );
}
