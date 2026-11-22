import { fetchExternalJson } from '../http.js';

/**
 * Géocodeur de l'IGN (Géoplateforme, ex-API Adresse ; Base Adresse
 * Nationale, Licence Ouverte Etalab), sans clé, France uniquement.
 *
 * Utilisé en SECOURS de Photon (services/geocoding.js) : l'instance publique
 * de Photon peut refuser les requêtes venant des serveurs Supabase (403).
 * Les résultats ont le même format que ceux de Photon.
 *
 * Adresse modifiable par le secret IGN_GEOCODE_URL, sans changer le code.
 */
const IGN_URL = () => globalThis.Deno?.env.get('IGN_GEOCODE_URL') ?? 'https://data.geopf.fr/geocodage';

const SOURCE = 'ign';

/** Nom du pays dans la langue demandée (seule la France est couverte). */
const FRANCE = { fr: 'France', en: 'France' };

function coords(feature) {
  const [lon, lat] = feature?.geometry?.coordinates ?? [];
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/**
 * Département extrait du contexte IGN ("14, Calvados, Normandie" → "Calvados" ;
 * "974, La Réunion" → "La Réunion").
 * @param {unknown} context
 */
export function regionFromContext(context) {
  if (typeof context !== 'string') return undefined;
  const parts = context.split(',').map((s) => s.trim()).filter(Boolean);
  return parts[1] ?? undefined;
}

/**
 * Convertit une commune IGN au format GeocodeResult (sans timezone) ; null
 * s'il ne s'agit pas d'une commune.
 * @param {{ properties?: Record<string, any>, geometry?: { coordinates: [number, number] } }} feature
 * @param {string} lang
 */
export function ignToResult(feature, lang = 'fr') {
  const p = feature?.properties ?? {};
  const point = coords(feature);
  const name = p.city ?? p.name;
  if (p.type !== 'municipality' || !name || !point) return null;
  const result = { name, country: FRANCE[lang] ?? 'France', countryCode: 'FR', ...point };
  const region = regionFromContext(p.context);
  return region ? { ...result, region } : result;
}

/**
 * Convertit une adresse IGN au format AddressResult ; null sans rue.
 * @param {{ properties?: Record<string, any>, geometry?: { coordinates: [number, number] } }} feature
 */
export function ignToAddress(feature) {
  const p = feature?.properties ?? {};
  const point = coords(feature);
  if (!point) return null;
  const street = p.type === 'housenumber' ? [p.housenumber, p.street].filter(Boolean).join(' ') || p.name : p.type === 'street' ? p.name : '';
  const place = [p.postcode, p.city].filter(Boolean).join(' ');
  if (!street) return null;
  return { address: [street, place].filter(Boolean).join(', '), countryCode: 'FR', ...point };
}

function uniqueBy(results, keyOf) {
  const seen = new Set();
  return results.filter((r) => {
    const key = keyOf(r);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const cityKey = (r) => `${r.name}|${r.region ?? ''}`;

/**
 * @param {string} q
 * @param {string} lang
 * @param {number} maxResults
 */
export async function ignSearchCities(q, lang, maxResults) {
  const params = new URLSearchParams({ q, index: 'address', type: 'municipality', limit: String(maxResults) });
  const json = await fetchExternalJson(`${IGN_URL()}/search?${params}`, { source: SOURCE });
  return uniqueBy((json.features ?? []).map((f) => ignToResult(f, lang)).filter(Boolean), cityKey).slice(0, maxResults);
}

/**
 * @param {{ lat: number, lon: number }} point
 * @param {string} lang
 */
export async function ignReverseCity(point, lang) {
  const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon), index: 'address', type: 'municipality', limit: '1' });
  const json = await fetchExternalJson(`${IGN_URL()}/reverse?${params}`, { source: SOURCE });
  return (json.features ?? []).map((f) => ignToResult(f, lang)).filter(Boolean).slice(0, 1);
}

/**
 * @param {string} q
 * @param {number} maxResults
 * @param {{ lat: number, lon: number } | null} bias
 */
export async function ignSearchAddresses(q, maxResults, bias) {
  const params = new URLSearchParams({ q, index: 'address', limit: String(maxResults * 2) });
  if (bias) {
    params.set('lat', String(bias.lat));
    params.set('lon', String(bias.lon));
  }
  const json = await fetchExternalJson(`${IGN_URL()}/search?${params}`, { source: SOURCE });
  return uniqueBy((json.features ?? []).map(ignToAddress).filter(Boolean), (r) => r.address).slice(0, maxResults);
}

/**
 * @param {{ lat: number, lon: number }} point
 */
export async function ignReverseAddress(point) {
  const params = new URLSearchParams({ lat: String(point.lat), lon: String(point.lon), index: 'address', limit: '1' });
  const json = await fetchExternalJson(`${IGN_URL()}/reverse?${params}`, { source: SOURCE });
  return (json.features ?? []).map(ignToAddress).filter(Boolean).slice(0, 1);
}
