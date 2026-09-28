import { genericPlaceName } from '../domain/displayName.js';
import { countriesInCircle } from '../domain/countryCoverage.js';
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

/**
 * Date des données d'un pays du manifeste ("YYYY-MM-DD") ; les entrées
 * écrites avant le manifeste v2 n'ont que extractDate, ou seulement le
 * dossier de leur version.
 * @param {{ dataDate?: string, extractDate?: string, path: string }} entry
 */
export const countryDataDate = (entry) => entry.dataDate ?? entry.extractDate?.slice(0, 10) ?? entry.path.split('/')[0];

/**
 * Tuiles qui touchent le cercle : pour chaque case de tileIdsForRadius, celle
 * de CHAQUE pays importé dont le manifeste contient la case, quel que soit
 * le pays de la destination (une case frontalière a un fichier par pays).
 * Une case absente du manifeste est vide : elle n'est pas lue.
 * @returns {{ path: string, code: string }[]}
 */
export function tilesInCircle(index, point, radiusKm) {
  const files = [];
  for (const tile of tileIdsForRadius(point.lat, point.lon, radiusKm, index.manifest.cellDeg)) {
    for (const [code, set] of Object.entries(index.tileSets)) {
      if (set.has(tile)) files.push({ path: `${index.manifest.countries[code].path}/${tile}.json.gz`, code });
    }
  }
  return files;
}

/**
 * Couverture OSM d'un cercle :
 *  - dates : date des données de chaque pays dont une tuile est lue (clé des caches) ;
 *  - missing : pays pris en charge que le cercle touche (contours
 *    approximatifs, domain/countryCoverage.js) mais pas encore importés,
 *    destination comprise ; leurs lieux manquent (statut "partial") ;
 *  - covered : faux si la destination n'est pas importée et qu'aucune tuile
 *    d'un autre pays n'est lue (message not_covered, comme avant).
 * @param {{ manifest: any, tileSets: Record<string, Set<string>> }} index
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {string} countryCode pays de la destination
 * @returns {{ dates: Record<string, string>, missing: string[], covered: boolean }}
 */
export function tilesCoverage(index, point, radiusKm, countryCode) {
  const dates = {};
  for (const { code } of tilesInCircle(index, point, radiusKm)) dates[code] ??= countryDataDate(index.manifest.countries[code]);
  const touched = new Set(countriesInCircle(point, radiusKm));
  touched.add(countryCode);
  const missing = [...touched].filter((code) => !isCovered(index, code)).sort();
  const sorted = Object.fromEntries(Object.keys(dates).sort().map((code) => [code, dates[code]]));
  return { dates: sorted, missing, covered: isCovered(index, countryCode) || Object.keys(dates).length > 0 };
}

/** Dates des données des pays lus, pour une clé de cache : "BE:2026-09-28,FR:2026-09-24". */
export const datesKey = (dates) => Object.entries(dates).map(([code, date]) => `${code}:${date}`).join(',');

/**
 * Lieux d'une tuile au format v2 [id, category, subcategory, name, lat, lon,
 * tags, names, cc], quel que soit le format du fichier : un lieu v1
 * [id, …, tags] n'a pas de names (ses variantes name:fr et name:en restent
 * dans tags) et son pays est celui du dossier. Retirer la branche v1 quand
 * tous les pays du manifeste en service sont en v2 (README, tâches).
 * @param {{ v?: number, places: any[] }} tile
 * @param {string} country code du pays du dossier
 */
export function normalizeTile(tile, country) {
  if (tile.v === 2) return tile.places;
  if (tile.v === 1) return tile.places.map((e) => [...e.slice(0, 7), null, country]);
  throw new Error(`format de tuile inconnu : ${tile.v}`);
}

/** Tuile décompressée (lieux au format v2), depuis la mémoire ou le bucket. */
async function readTile(store, path, rules, country) {
  const hit = memory.tiles.get(path);
  if (hit) {
    memory.tiles.delete(path); // replacée en fin : la plus récemment lue
    memory.tiles.set(path, hit);
    return hit.places;
  }
  return once(path, async () => {
    const text = await readText(store, path);
    const places = normalizeTile(JSON.parse(text), country);
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
 * Lieux compacts des tuiles qui touchent le cercle (tilesInCircle), tous pays
 * confondus. Doublons retirés par identifiant OSM avant tout filtrage par
 * distance (les extraits Geofabrik se chevauchent aux frontières) : même id =
 * même lieu ; on garde la copie du pays dont la date des données est la plus
 * récente (à date égale, la première lue, ordre des codes pays).
 * @returns {Promise<{ entries: any[], tilesRead: number, tilesByCountry: Record<string, number> }>}
 */
async function readEntries(point, radiusKm, { rules, index, store }) {
  const files = tilesInCircle(index, point, radiusKm);
  const tiles = await Promise.all(files.map(({ path, code }) => readTile(store, path, rules, code)));
  const byId = new Map();
  tiles.forEach((places, i) => {
    const date = countryDataDate(index.manifest.countries[files[i].code]);
    for (const entry of places) {
      const kept = byId.get(entry[0]);
      if (!kept || date > kept.date) byId.set(entry[0], { entry, date });
    }
  });
  const tilesByCountry = {};
  for (const { code } of files) tilesByCountry[code] = (tilesByCountry[code] ?? 0) + 1;
  return { entries: [...byId.values()].map((v) => v.entry), tilesRead: files.length, tilesByCountry };
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

/**
 * Élément au format Overpass ("out center tags") reconstruit depuis un lieu
 * compact de tuile (format v2, voir normalizeTile) : osmElementToPlace et
 * osmHeritageElementToPlace en tirent le même Place qu'avec Overpass. Les
 * variantes names redeviennent des tags name:<langue>.
 * @param {[string, string, string, string | null, number, number, Record<string, string>, Record<string, string> | null, string]} entry
 * @returns {{ type: string, id: number, lat: number, lon: number, tags: Record<string, string> } | null}
 */
export function entryToElement([id, category, subcategory, name, lat, lon, tags, names]) {
  const type = OSM_TYPES[id[0]];
  const kindTags = categoryTags(category, subcategory);
  if (!type || !kindTags) return null;
  const all = { ...tags, ...kindTags };
  for (const [lang, value] of Object.entries(names ?? {})) all[`name:${lang}`] = value;
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
    const generic = genericPlaceName(entry[2], lang);
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
 * distance. stats reçoit le nombre de tuiles lues (tilesRead) et leur
 * nombre par pays (tilesByCountry).
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {{ rules: any, lang: string, includeRestaurants: boolean, index: any, store: TileStore, stats?: { tilesRead: number, tilesByCountry?: Record<string, number> } }} options
 * @returns {Promise<import('../domain/model.js').Place[]>}
 */
export async function fetchOsmTilePlaces(point, radiusKm, { rules, lang, includeRestaurants, index, store, stats }) {
  const { entries, tilesRead, tilesByCountry } = await readEntries(point, radiusKm, { rules, index, store });
  if (stats) Object.assign(stats, { tilesRead, tilesByCountry });
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
