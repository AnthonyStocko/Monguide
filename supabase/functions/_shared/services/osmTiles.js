import { distanceKm } from '../domain/geo.js';
import { tileIdsForRadius } from '../domain/osmGrid.js';
import { ExternalError } from '../errors.js';
import { getAdminClient } from '../supabaseAdmin.js';
import { osmElementToPlace, osmHeritageElementToPlace } from './osmMapping.js';

/**
 * Lieux OpenStreetMap lus dans les tuiles statiques du bucket privé
 * osm-tiles (docs/osm-tiles.md), à la place d'Overpass : mêmes lieux, mêmes
 * objets Place (conversion par osmElementToPlace), mêmes plafonds par groupe.
 *
 * Caches par instance de fonction : pointeur current.json (relu toutes les
 * rules.osm.tiles.pointerTtlSec), manifestes (fichiers jamais modifiés),
 * tuiles décompressées (au plus rules.osm.tiles.memoryCacheMb Mo, les moins
 * récemment lues supprimées d'abord) et dernières réponses calculées.
 */

const BUCKET = 'osm-tiles';

/**
 * @typedef {object} TileStore Accès aux fichiers du bucket (injecté dans les tests).
 * @property {(path: string) => Promise<Blob>} read
 */

/** @returns {TileStore} lecture avec la clé service_role (bucket privé). */
export function storageTileStore() {
  return {
    async read(path) {
      const { data, error } = await getAdminClient().storage.from(BUCKET).download(path);
      if (error || !data) throw new ExternalError('osm-tiles', Number(error?.status ?? error?.statusCode) || null, false);
      return data;
    }
  };
}

const memory = { pointer: null, pointerExpires: 0, manifests: new Map(), tiles: new Map(), tileBytes: 0, inflight: new Map(), responses: new Map() };

/** Réponses (listes de Place) gardées en mémoire, par clé de cache. */
const MAX_RESPONSES = 200;

/** Vide les caches en mémoire (tests). */
export function resetOsmTilesMemory() {
  memory.pointer = null;
  memory.pointerExpires = 0;
  memory.manifests.clear();
  memory.tiles.clear();
  memory.tileBytes = 0;
  memory.inflight.clear();
  memory.responses.clear();
}

/**
 * Réponse déjà calculée par cette instance (clé de cache avec la date des
 * données) : évite l'aller-retour vers le cache partagé.
 * @param {string} key
 */
export function recallResponse(key) {
  const hit = memory.responses.get(key);
  if (!hit) return undefined;
  memory.responses.delete(key);
  memory.responses.set(key, hit);
  return hit;
}

/**
 * @param {string} key
 * @param {unknown} value
 */
export function rememberResponse(key, value) {
  memory.responses.delete(key);
  memory.responses.set(key, value);
  if (memory.responses.size > MAX_RESPONSES) memory.responses.delete(memory.responses.keys().next().value);
}

/** Une seule lecture à la fois pour un même fichier (zones du séjour lues en parallèle). */
function once(key, load) {
  if (!memory.inflight.has(key)) {
    memory.inflight.set(
      key,
      load().finally(() => memory.inflight.delete(key))
    );
  }
  return memory.inflight.get(key);
}

async function readText(store, path) {
  const blob = await store.read(path);
  const stream = path.endsWith('.gz') ? blob.stream().pipeThrough(new DecompressionStream('gzip')) : blob.stream();
  return new Response(stream).text();
}

/**
 * Pointeur current.json de la version en service ({ dataDate, manifest,
 * previous }), relu toutes les rules.osm.tiles.pointerTtlSec.
 * @param {any} rules
 * @param {TileStore} store
 */
export async function loadTilesPointer(rules, store) {
  if (!memory.pointer || Date.now() >= memory.pointerExpires) {
    memory.pointer = await once('current.json', async () => JSON.parse(await readText(store, 'current.json')));
    memory.pointerExpires = Date.now() + rules.osm.tiles.pointerTtlSec * 1000;
  }
  return memory.pointer;
}

/**
 * Version en service : pointeur current.json et son manifeste, avec pour
 * chaque pays l'ensemble de ses cases non vides.
 * @param {any} rules
 * @param {TileStore} store
 * @param {{ manifest: string } | null} [pointer] pointeur déjà connu (lu avec la configuration)
 * @returns {Promise<{ dataDate: string, manifest: any, tileSets: Record<string, Set<string>> }>}
 */
export async function loadTilesIndex(rules, store, pointer) {
  const path = (pointer ?? (await loadTilesPointer(rules, store))).manifest;
  if (!memory.manifests.has(path)) {
    const manifest = await once(path, async () => JSON.parse(await readText(store, path)));
    const tileSets = Object.fromEntries(Object.entries(manifest.countries).map(([code, c]) => [code, new Set(c.tiles)]));
    memory.manifests.clear(); // une seule version utile à la fois
    memory.manifests.set(path, { dataDate: manifest.dataDate, manifest, tileSets });
  }
  return memory.manifests.get(path);
}

/** Pays couvert par la version en service ? */
export const isCovered = (index, countryCode) => Boolean(index.manifest.countries[countryCode]);

/** Tuile décompressée, depuis la mémoire ou le bucket. */
async function readTile(store, path, rules) {
  const hit = memory.tiles.get(path);
  if (hit) {
    memory.tiles.delete(path); // replacée en fin : la plus récemment lue
    memory.tiles.set(path, hit);
    return hit.places;
  }
  return once(path, async () => {
    const text = await readText(store, path);
    const { places } = JSON.parse(text);
    memory.tiles.set(path, { places, bytes: text.length });
    memory.tileBytes += text.length;
    const max = rules.osm.tiles.memoryCacheMb * 1024 * 1024;
    for (const [key, value] of memory.tiles) {
      if (memory.tileBytes <= max || key === path) break;
      memory.tiles.delete(key);
      memory.tileBytes -= value.bytes;
    }
    return places;
  });
}

/**
 * Lieux compacts des tuiles qui touchent le cercle, tous pays couverts
 * confondus (une case frontalière a un fichier par pays), sans doublon.
 * Une case absente du manifeste est vide : elle n'est pas lue.
 * @returns {Promise<{ entries: any[], tilesRead: number }>}
 */
async function readEntries(point, radiusKm, { rules, index, store }) {
  const paths = [];
  for (const tile of tileIdsForRadius(point.lat, point.lon, radiusKm, index.manifest.cellDeg)) {
    for (const [code, set] of Object.entries(index.tileSets)) {
      if (set.has(tile)) paths.push(`${index.manifest.countries[code].path}/${tile}.json.gz`);
    }
  }
  const tiles = await Promise.all(paths.map((path) => readTile(store, path, rules)));
  const seen = new Set();
  const entries = [];
  for (const places of tiles) {
    for (const entry of places) {
      if (seen.has(entry[0])) continue;
      seen.add(entry[0]);
      entries.push(entry);
    }
  }
  return { entries, tilesRead: paths.length };
}

const OSM_TYPES = { n: 'node', w: 'way', r: 'relation' };

/**
 * Tags OSM qui redonnent la catégorie et la sous-catégorie (inverse du
 * classement de scripts/osm-tiles/features.js).
 * @param {string} category
 * @param {string} subcategory
 */
function categoryTags(category, subcategory) {
  switch (category) {
    case 'restaurant':
      return { amenity: 'restaurant' };
    case 'market':
      return subcategory === 'covered_market' ? { amenity: 'marketplace', covered: 'yes' } : { amenity: 'marketplace' };
    case 'farm':
      return { shop: 'farm' };
    case 'park':
      return { leisure: 'park' };
    case 'nature':
      return { boundary: 'protected_area' };
    case 'viewpoint':
      return { tourism: 'viewpoint' };
    case 'small_heritage':
      return subcategory === 'lavoir' ? { amenity: 'lavoir' } : { historic: subcategory };
    case 'museum':
      return { tourism: 'museum' };
    case 'monument':
      return { historic: subcategory };
    default:
      return null;
  }
}

/** Noms génériques des lieux sans nom (rules.osm.unnamedTypes). */
const GENERIC_NAMES = {
  fr: { viewpoint: 'Point de vue', lavoir: 'Lavoir', ruins: 'Ruines', wayside_cross: 'Calvaire', memorial: 'Monument commémoratif' },
  en: { viewpoint: 'Viewpoint', lavoir: 'Wash house', ruins: 'Ruins', wayside_cross: 'Wayside cross', memorial: 'Memorial' }
};

/**
 * Élément au format Overpass ("out center tags") reconstruit depuis un lieu
 * compact de tuile : osmElementToPlace et osmHeritageElementToPlace en
 * tirent le même Place qu'avec Overpass.
 * @param {[string, string, string, string | null, number, number, Record<string, string>]} entry
 * @returns {{ type: string, id: number, lat: number, lon: number, tags: Record<string, string> } | null}
 */
export function entryToElement([id, category, subcategory, name, lat, lon, tags]) {
  const type = OSM_TYPES[id[0]];
  const kindTags = categoryTags(category, subcategory);
  if (!type || !kindTags) return null;
  const all = { ...tags, ...kindTags };
  if (name) all.name = name;
  return { type, id: Number(id.slice(1)), lat, lon, tags: all };
}

/**
 * Place d'un lieu compact ; les lieux sans nom ne sont gardés que pour les
 * sous-catégories de rules.osm.unnamedTypes, sous un nom générique.
 */
function entryToPlace(entry, { rules, lang }) {
  const element = entryToElement(entry);
  if (!element) return null;
  const options = { lang, regionalCuisines: rules.places.regionalCuisines };
  const named = element.tags[`name:${lang}`] ?? element.tags.name;
  if (!named?.trim()) {
    const generic = GENERIC_NAMES[lang]?.[entry[2]] ?? GENERIC_NAMES.fr[entry[2]];
    if (!generic || !rules.osm.unnamedTypes.includes(entry[2])) return null;
    const place = osmElementToPlace({ ...element, tags: { ...element.tags, name: generic } }, options);
    return place && { ...place, unnamed: true };
  }
  return osmElementToPlace(element, options);
}

/** Groupe de plafond (rules.osm.limits), comme les groupes de la requête Overpass. */
const LIMIT_GROUP = { restaurant: 'food', market: 'local', farm: 'local', park: 'nature', nature: 'nature', viewpoint: 'heritage', small_heritage: 'heritage' };

/**
 * Même signature et même sortie que fetchOsmPlaces (osm.js) : lieux dans le
 * rayon (restaurants dans rules.osm.restaurantRadiusKm), au plus
 * rules.osm.limits par groupe en gardant les plus proches, triés par
 * distance. stats.tilesRead reçoit le nombre de tuiles lues.
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {{ rules: any, lang: string, includeRestaurants: boolean, index: any, store: TileStore, stats?: { tilesRead: number } }} options
 * @returns {Promise<import('../domain/model.js').Place[]>}
 */
export async function fetchOsmTilePlaces(point, radiusKm, { rules, lang, includeRestaurants, index, store, stats }) {
  const { entries, tilesRead } = await readEntries(point, radiusKm, { rules, index, store });
  if (stats) stats.tilesRead = tilesRead;
  const foodRadiusKm = Math.min(radiusKm, rules.osm.restaurantRadiusKm);
  const candidates = [];
  for (const entry of entries) {
    const group = LIMIT_GROUP[entry[1]];
    if (!group || (group === 'food' && !includeRestaurants)) continue;
    const d = distanceKm(point, { lat: entry[4], lon: entry[5] });
    if (d > (group === 'food' ? foodRadiusKm : radiusKm)) continue;
    candidates.push({ entry, group, d });
  }
  candidates.sort((a, b) => a.d - b.d || (a.entry[0] < b.entry[0] ? -1 : 1));
  const used = {};
  const places = [];
  for (const { entry, group } of candidates) {
    if ((used[group] ?? 0) >= rules.osm.limits[group]) continue;
    const place = entryToPlace(entry, { rules, lang });
    if (!place) continue;
    used[group] = (used[group] ?? 0) + 1;
    places.push(place);
  }
  return places;
}

/**
 * Même sortie que fetchOsmHeritage (osm.js) : repli du patrimoine quand
 * Wikidata échoue, monuments protégés et musées des tuiles (pays configurés
 * avec heritageFallback), 150 de chaque au plus, les plus proches.
 * @returns {Promise<{ monuments: import('../domain/model.js').Place[], museums: import('../domain/model.js').Place[] }>}
 */
export async function fetchOsmTileHeritage(point, radiusKm, { rules, lang, index, store }) {
  const { entries } = await readEntries(point, radiusKm, { rules, index, store });
  const nearest = entries
    .filter((e) => e[1] === 'monument' || e[1] === 'museum')
    .map((entry) => ({ entry, d: distanceKm(point, { lat: entry[4], lon: entry[5] }) }))
    .filter((c) => c.d <= radiusKm)
    .sort((a, b) => a.d - b.d || (a.entry[0] < b.entry[0] ? -1 : 1));
  const out = { monuments: [], museums: [] };
  for (const { entry } of nearest) {
    const list = entry[1] === 'monument' ? out.monuments : out.museums;
    if (list.length >= 150) continue;
    const place = osmHeritageElementToPlace(entryToElement(entry), { lang });
    if (place) list.push(place);
  }
  return out;
}

/**
 * Source OSM effective (rules.osm.source) : "tiles", "overpass" ou "off".
 * @param {any} rules
 * @returns {'tiles' | 'overpass' | 'off'}
 */
export function osmSourceSetting(rules) {
  return rules.osm.source === 'overpass' || rules.osm.source === 'off' ? rules.osm.source : 'tiles';
}
