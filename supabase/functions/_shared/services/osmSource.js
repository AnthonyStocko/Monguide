import { cacheKey } from '../cacheKey.js';
import { log } from '../log.js';
import { fetchOsmHeritage, fetchOsmPlaces } from './osm.js';
import {
  fetchOsmTileHeritage,
  fetchOsmTilePlaces,
  countryDataDate,
  datesKey,
  loadTilesIndex,
  loadTilesPointer,
  osmSourceSetting,
  recallResponse,
  rememberResponse,
  storageTileStore,
  tilesCoverage
} from './osmTiles.js';
import { describeError, runSource } from './sourceRunner.js';

/**
 * Choix de la source des lieux OSM selon rules.osm.source (surchargeable
 * par app_config, clé "osm.source") : tuiles statiques, Overpass, ou rien.
 * La source "osm" de la réponse places indique en plus : source utilisée
 * (source), date des données (dataDate) et nombre de tuiles lues (tilesRead)
 * en mode tuiles, avec dataDates (date des données par pays lu) et
 * tilesByCountry (tuiles lues par pays) ; durationMs y compte aussi la lecture de la version en
 * service et du cache, et timings la détaille (lookup : cache partagé,
 * index : manifeste, tiles : lecture des tuiles, en ms depuis le début).
 *
 * Mode tuiles, plusieurs pays : les tuiles de tous les pays importés qui
 * touchent le cercle sont lues, quel que soit le pays de la destination.
 * Si le cercle touche un pays pris en charge mais pas encore importé, la
 * source est "partial" (message "partial", missingCountries) : ses lieux
 * manquent, la génération continue normalement. dataDates donne la date
 * des données de chaque pays lu.
 *
 * Rapidité en mode tuiles : le pointeur current.json arrive avec la
 * configuration (ctx.osmPointer) ; le manifeste est gardé en mémoire par
 * instance. La clé du cache partagé contient la date des données de chaque
 * pays lu (connue par le manifeste) : le cache est interrogé en parallèle
 * de la lecture des tuiles ; les réponses sont aussi gardées en mémoire, et
 * le cache partagé est écrit après la réponse.
 */

/** Magasin des tuiles : ctx.tileStore dans les tests, bucket privé sinon. */
const storeOf = (ctx) => ctx.tileStore ?? storageTileStore();

/**
 * Version en service des tuiles, ou résultat "failed" de la source name.
 * @returns {Promise<{ index: any } | { failed: import('./sourceRunner.js').SourceOutcome<never> }>}
 */
async function tilesIndex(name, ctx, started) {
  try {
    return { index: await loadTilesIndex(ctx.rules, storeOf(ctx), ctx.osmPointer) };
  } catch (err) {
    const message = describeError(err);
    log('warn', 'source_failed', { source: name, message, stale: false });
    return { failed: { name, status: 'failed', message, durationMs: Date.now() - started, source: 'tiles' } };
  }
}

/**
 * Pointeur current.json de la version en service, lu avec la configuration
 * (appConfig.js) : { dataDate, manifest, countries }, ou null hors mode
 * tuiles ou si la version en service est illisible (places retentera la
 * lecture). countries : date des données de chaque pays importé (manifeste,
 * gardé en mémoire), ou null si le manifeste est illisible.
 * @param {any} rules
 * @param {{ tileStore?: import('./osmTiles.js').TileStore }} [ctx]
 * @returns {Promise<{ dataDate: string, manifest: string, countries: Record<string, string> | null } | null>}
 */
export async function readOsmPointer(rules, ctx = {}) {
  if (osmSourceSetting(rules) !== 'tiles') return null;
  let pointer;
  try {
    const current = await loadTilesPointer(rules, storeOf(ctx));
    if (typeof current.dataDate !== 'string' || typeof current.manifest !== 'string') return null;
    pointer = { dataDate: current.dataDate, manifest: current.manifest };
  } catch (err) {
    log('warn', 'osm_tiles_pointer_failed', { message: describeError(err) });
    return null;
  }
  try {
    const { manifest } = await loadTilesIndex(rules, storeOf(ctx), pointer);
    const codes = Object.keys(manifest.countries).sort();
    return { ...pointer, countries: Object.fromEntries(codes.map((code) => [code, countryDataDate(manifest.countries[code])])) };
  } catch (err) {
    log('warn', 'osm_tiles_manifest_failed', { message: describeError(err) });
    return { ...pointer, countries: null };
  }
}

/**
 * Source OSM active, date de la version en service et date des données de
 * chaque pays importé (fonction config, écran « À propos », /debug).
 * @param {any} rules
 * @param {{ dataDate: string, countries?: Record<string, string> | null } | null | undefined} pointer
 * @returns {{ source: 'tiles' | 'overpass' | 'off', dataDate: string | null, countries: Record<string, string> | null }}
 */
export function osmInfo(rules, pointer) {
  const source = osmSourceSetting(rules);
  if (source !== 'tiles') return { source, dataDate: null, countries: null };
  return { source, dataDate: pointer?.dataDate ?? null, countries: pointer?.countries ?? null };
}

/**
 * Forme des Place OSM, dans les clés de cache : 2 = name tel quel et variantes
 * dans names (displayName.js). Les réponses en cache d'avant n'ont pas names :
 * elles ne sont plus servies.
 */
const PLACE_FORMAT = 2;

/**
 * Lieux OSM (restaurants, marchés, nature, petit patrimoine) autour du point.
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {boolean} includeRestaurants
 * @param {import('../providers/types.js').ProviderContext & { tileStore?: import('./osmTiles.js').TileStore }} ctx
 */
export async function osmPlacesSource(point, radiusKm, includeRestaurants, ctx) {
  const setting = osmSourceSetting(ctx.rules);
  const params = { lat: point.lat, lon: point.lon, radius: radiusKm, lang: ctx.lang, restaurants: includeRestaurants, place: PLACE_FORMAT };
  if (setting === 'off') return { name: 'osm', status: 'failed', message: 'disabled', source: 'off' };
  if (setting === 'overpass') {
    const outcome = await runSource({
      name: 'osm',
      cacheSource: 'osm',
      params,
      ttlSec: ctx.rules.cacheTtlSec.osm,
      cache: ctx.cache,
      fetcher: () => fetchOsmPlaces(point, radiusKm, { rules: ctx.rules, lang: ctx.lang, includeRestaurants })
    });
    return { ...outcome, source: 'overpass' };
  }

  const started = Date.now();
  const since = (t) => Date.now() - t;
  const timings = {};
  let pointer = ctx.osmPointer;
  if (!pointer) {
    try {
      pointer = await loadTilesPointer(ctx.rules, storeOf(ctx));
    } catch (err) {
      const message = describeError(err);
      log('warn', 'source_failed', { source: 'osm', message, stale: false });
      return { name: 'osm', status: 'failed', message, durationMs: since(started), source: 'tiles' };
    }
  }
  const loaded = await tilesIndex('osm', { ...ctx, osmPointer: pointer }, started);
  timings.index = since(started);
  if (loaded.failed) return { ...loaded.failed, dataDate: pointer.dataDate };
  const coverage = tilesCoverage(loaded.index, point, radiusKm, ctx.countryCode);
  const meta = { source: 'tiles', dataDate: pointer.dataDate, dataDates: coverage.dates };
  // Pays pas encore importé, sans aucun pays importé dans le rayon : ce n'est pas une panne,
  // la génération continue sans ces lieux.
  if (!coverage.covered) return { name: 'osm', status: 'failed', message: 'not_covered', durationMs: since(started), ...meta };
  // Pays touché mais pas encore importé : lieux des autres pays seulement, statut "partial".
  const partial = coverage.missing.length > 0;
  const statusOf = (status) => (partial ? 'partial' : status);
  const partialInfo = partial ? { message: 'partial', missingCountries: coverage.missing } : {};
  // Date des données de chaque pays lu dans la clé : un nouvel import invalide le cache.
  const key = cacheKey('osm-tiles', { ...params, data: datesKey(coverage.dates) });
  const remembered = recallResponse(key);
  if (remembered) return { name: 'osm', status: statusOf('cache'), ...partialInfo, durationMs: since(started), ...meta, tilesRead: 0, timings, data: remembered };

  // Cache partagé et tuiles en parallèle : un aller-retour vers la base
  // coûte autant que la lecture des tuiles.
  const stats = { tilesRead: 0, tilesByCountry: {} };
  const lookup = ctx.cache
    .lookup(key)
    .catch(() => undefined)
    .finally(() => (timings.lookup = since(started)));
  const read = fetchOsmTilePlaces(point, radiusKm, { rules: ctx.rules, lang: ctx.lang, includeRestaurants, index: loaded.index, store: storeOf(ctx), stats })
    .then((data) => ({ data }))
    .catch((error) => ({ error }))
    .finally(() => (timings.tiles = since(started)));
  const entry = await lookup;
  if (entry?.fresh) {
    rememberResponse(key, entry.value);
    return { name: 'osm', status: statusOf('cache'), ...partialInfo, durationMs: since(started), ...meta, tilesRead: 0, timings, data: entry.value };
  }
  const result = await read;
  if (result.error) {
    const failure = describeError(result.error);
    log('warn', 'source_failed', { source: 'osm', message: failure, stale: Boolean(entry) });
    if (entry) return { name: 'osm', status: 'cache', message: 'stale', ...(partial ? { missingCountries: coverage.missing } : {}), durationMs: since(started), ...meta, tilesRead: 0, timings, data: entry.value };
    return { name: 'osm', status: 'failed', message: failure, durationMs: since(started), ...meta };
  }
  const { data } = result;
  rememberResponse(key, data);
  // Écriture du cache partagé après la réponse (sinon attendue : tests, Node).
  const write = ctx.cache.set(key, 'osm-tiles', data, ctx.rules.cacheTtlSec.osm).catch(() => {});
  if (globalThis.EdgeRuntime?.waitUntil) globalThis.EdgeRuntime.waitUntil(write);
  else await write;
  return { name: 'osm', status: statusOf('ok'), ...partialInfo, durationMs: since(started), ...meta, tilesRead: stats.tilesRead, tilesByCountry: stats.tilesByCountry, timings, data };
}

/**
 * Repli du patrimoine hors de France quand Wikidata échoue (même sortie que
 * fetchOsmHeritage) : runSource de la source "heritage-osm", ou null avec
 * osm.source = "off" (pas de repli).
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {Record<string, unknown>} params paramètres de la clé de cache
 * @param {any} ctx
 */
export async function osmHeritageFallback(point, radiusKm, params, ctx) {
  const setting = osmSourceSetting(ctx.rules);
  if (setting === 'off') return null;
  const base = { name: 'heritage-osm', ttlSec: ctx.rules.cacheTtlSec.osm, cache: ctx.cache };
  if (setting === 'overpass') {
    return runSource({ ...base, cacheSource: 'osm-heritage', params: { ...params, place: PLACE_FORMAT }, fetcher: () => fetchOsmHeritage(point, radiusKm, { rules: ctx.rules, lang: ctx.lang }) });
  }
  const loaded = await tilesIndex('heritage-osm', ctx, Date.now());
  if (loaded.failed) return loaded.failed;
  const { index } = loaded;
  const coverage = tilesCoverage(index, point, radiusKm, ctx.countryCode);
  // Aucun pays importé dans le rayon : échec immédiat, sans attendre de délai.
  if (!coverage.covered) return { name: 'heritage-osm', status: 'failed', message: 'not_covered' };
  return runSource({
    ...base,
    cacheSource: 'osm-heritage-tiles',
    // Date des données de chaque pays lu dans la clé.
    params: { ...params, data: datesKey(coverage.dates), place: PLACE_FORMAT },
    fetcher: () => fetchOsmTileHeritage(point, radiusKm, { rules: ctx.rules, lang: ctx.lang, index, store: storeOf(ctx) })
  });
}
