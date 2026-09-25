import { boundingBox, distanceKm } from '../domain/geo.js';
import { ExternalError } from '../errors.js';
import { fetchExternal } from '../http.js';
import { osmElementToPlace, osmHeritageElementToPlace } from './osmMapping.js';

// Source de SECOURS des lieux OSM, désactivée par défaut : les lieux viennent
// des tuiles mensuelles (osmTiles.js, docs/osm-tiles.md). Rétablie par
// osm.source = "overpass" dans app_config (README, « Lieux OpenStreetMap »).

/**
 * Instance Overpass (secret OVERPASS_URL pour une autre instance ou un test).
 * Constat du 2026-09-24 : overpass-api.de répond 406 à toute requête issue des
 * Edge Functions, car Supabase ajoute au User-Agent sa propre signature
 * ("… (variant; SupabaseEdgeRuntime/…)"), refusée par cette instance.
 */
const OVERPASS_URL = () => globalThis.Deno?.env.get('OVERPASS_URL') ?? 'https://overpass-api.de/api/interpreter';

const round5 = (n) => Math.round(n * 1e5) / 1e5;

/** Filtre Overpass par rectangle englobant le cercle : (sud,ouest,nord,est). */
function bbox(point, km) {
  const b = boundingBox(point, km);
  return `(${round5(b.minLat)},${round5(b.minLon)},${round5(b.maxLat)},${round5(b.maxLon)})`;
}

/**
 * Requête Overpass en quatre groupes limités chacun (200 résultats au total,
 * rules.osm.limits) : restaurants (rayon réduit), marchés et producteurs,
 * parcs et espaces naturels, petit patrimoine. Seuls les objets nommés sont
 * demandés. Délai côté serveur Overpass : [timeout:N].
 *
 * Le filtre (around:…) d'Overpass est très coûteux sur un grand rayon (plus
 * de 13 s mesurées pour 20 km) : on interroge le rectangle englobant le
 * cercle, puis fetchOsmPlaces ne garde que les lieux dans le rayon.
 *
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {{ osm: { timeoutSec: number, restaurantRadiusKm: number, limits: Record<string, number> } }} rules
 * @param {{ includeRestaurants: boolean }} options
 */
export function buildOverpassQuery(point, radiusKm, rules, { includeRestaurants }) {
  const { timeoutSec, restaurantRadiusKm, limits } = rules.osm;
  const r = bbox(point, radiusKm);
  const rFood = bbox(point, Math.min(radiusKm, restaurantRadiusKm));
  const lines = [`[out:json][timeout:${timeoutSec}];`];
  if (includeRestaurants) lines.push(`(nw["amenity"="restaurant"]["name"]${rFood};)->.food;`);
  lines.push(
    `(nw["amenity"="marketplace"]["name"]${r};nw["shop"="farm"]["name"]${r};)->.local;`,
    `(nwr["leisure"="park"]["name"]${r};nwr["boundary"="protected_area"]["name"]${r};)->.nature;`,
    `(nw["historic"~"^(wayside_cross|memorial|ruins)$"]["name"]${r};nw["tourism"="viewpoint"]["name"]${r};` +
      `nw["amenity"="lavoir"]["name"]${r};nw["man_made"="lavoir"]["name"]${r};)->.heritage;`
  );
  if (includeRestaurants) lines.push(`.food out center tags qt ${limits.food};`);
  lines.push(
    `.local out center tags qt ${limits.local};`,
    `.nature out center tags qt ${limits.nature};`,
    `.heritage out center tags qt ${limits.heritage};`
  );
  return lines.join('\n');
}

/**
 * Exécute une requête Overpass. Exception à la règle HTTP globale : délai
 * client strict (rules.osm.timeoutSec) et UN SEUL essai : pas de nouvelle
 * tentative, en particulier sur 429 et 504, car réessayer aggrave le blocage.
 * L'échec est géré par l'appelant (cache, ou source "failed").
 * @param {string} query
 * @param {any} rules
 * @returns {Promise<any[]>} éléments
 */
async function runOverpass(query, rules) {
  const res = await fetchExternal(OVERPASS_URL(), {
    source: 'overpass',
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }).toString(),
    timeoutMs: rules.osm.timeoutSec * 1000,
    maxAttempts: 1
  });
  let json;
  try {
    json = await res.json();
  } catch {
    throw new ExternalError('overpass', res.status, false);
  }
  // Overpass peut répondre 200 avec une erreur d'exécution (délai dépassé) :
  // c'est un échec, surtout pas un résultat vide à mettre en cache.
  if (typeof json.remark === 'string' && /error/i.test(json.remark)) throw new ExternalError('overpass', 504, false);
  return json.elements ?? [];
}

/**
 * Lieux OpenStreetMap autour d'un point (marchés, restaurants, nature, petit
 * patrimoine), limités au rayon.
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {{ rules: any, lang: string, includeRestaurants: boolean }} options
 * @returns {Promise<import('../domain/model.js').Place[]>}
 */
export async function fetchOsmPlaces(point, radiusKm, { rules, lang, includeRestaurants }) {
  const elements = await runOverpass(buildOverpassQuery(point, radiusKm, rules, { includeRestaurants }), rules);
  const options = { lang, regionalCuisines: rules.places.regionalCuisines };
  const foodRadiusKm = Math.min(radiusKm, rules.osm.restaurantRadiusKm);
  return elements
    .map((el) => osmElementToPlace(el, options))
    .filter((p) => p && distanceKm(point, p) <= (p.category === 'restaurant' ? foodRadiusKm : radiusKm));
}

/**
 * Requête de repli du patrimoine quand Wikidata échoue : monuments protégés
 * (heritage=1 ou 2) et musées (tourism=museum), 150 de chaque au plus.
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {any} rules
 */
export function buildOsmHeritageQuery(point, radiusKm, rules) {
  const r = bbox(point, radiusKm);
  return [
    `[out:json][timeout:${rules.osm.timeoutSec}];`,
    `nwr["heritage"~"^(1|2)$"]["name"]${r};`,
    'out center tags qt 150;',
    `nwr["tourism"="museum"]["name"]${r};`,
    'out center tags qt 150;'
  ].join('\n');
}

/**
 * Patrimoine OpenStreetMap (repli), séparé en monuments et musées.
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {{ rules: any, lang: string }} options
 * @returns {Promise<{ monuments: import('../domain/model.js').Place[], museums: import('../domain/model.js').Place[] }>}
 */
export async function fetchOsmHeritage(point, radiusKm, { rules, lang }) {
  const elements = await runOverpass(buildOsmHeritageQuery(point, radiusKm, rules), rules);
  const places = elements.map((el) => osmHeritageElementToPlace(el, { lang })).filter((p) => p && distanceKm(point, p) <= radiusKm);
  return { monuments: places.filter((p) => p.category === 'monument'), museums: places.filter((p) => p.category === 'museum') };
}
