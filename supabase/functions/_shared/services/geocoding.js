import { countryInfo } from '../domain/countries.js';
import { fetchExternalJson } from '../http.js';

/**
 * Recherche de destination avec Photon (photon.komoot.io, données
 * OpenStreetMap, sans clé). Nominatim n'est PAS utilisé : ses conditions
 * d'utilisation interdisent l'autocomplétion.
 *
 * L'instance publique de Photon est réservée à un usage raisonnable. Pour une
 * diffusion large, passer à une instance dédiée (auto-hébergée ou payante) :
 * il suffit de définir le secret PHOTON_URL, sans changer le code.
 */
const PHOTON_URL = () => globalThis.Deno?.env.get('PHOTON_URL') ?? 'https://photon.komoot.io';

/** Langues acceptées par Photon parmi celles de l'application. */
const PHOTON_LANGS = ['fr', 'en'];

/**
 * @typedef {object} GeocodeResult
 * @property {string} name
 * @property {string} [region] département ou région
 * @property {string} country
 * @property {string} countryCode ISO 3166-1 alpha-2
 * @property {number} lat
 * @property {number} lon
 * @property {string} timezone IANA
 */

/**
 * Convertit un résultat Photon ; null s'il n'est pas une commune d'un pays
 * pris en charge.
 * @param {{ properties: Record<string, any>, geometry: { coordinates: [number, number] } }} feature
 * @returns {GeocodeResult | null}
 */
export function photonToResult(feature) {
  const p = feature?.properties ?? {};
  const [lon, lat] = feature?.geometry?.coordinates ?? [];
  const country = countryInfo(p.countrycode);
  if (!country || p.type !== 'city' || !p.name || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const result = { name: p.name, country: p.country ?? country.code, countryCode: country.code, lat, lon, timezone: country.timezone };
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
export async function searchCities(q, lang, maxResults) {
  // On demande plus de résultats que nécessaire : certains sont filtrés
  // (pays non pris en charge, doublons).
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
export async function reverseCity(point, lang) {
  const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon), limit: '1', ...photonParams(lang) });
  const json = await fetchExternalJson(`${PHOTON_URL()}/reverse?${params}`, { source: 'photon' });
  return (json.features ?? []).map(photonToResult).filter(Boolean).slice(0, 1);
}
