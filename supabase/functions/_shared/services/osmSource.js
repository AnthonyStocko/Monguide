import { cacheKey } from '../cacheKey.js';
import { log } from '../log.js';
import { fetchOsmHeritage, fetchOsmPlaces } from './osm.js';
import {
  fetchOsmTileHeritage,
  fetchOsmTilePlaces,
  isCovered,
  loadTilesIndex,
  loadTilesPointer,
  osmSourceSetting,
  recallResponse,
  rememberResponse,
  storageTileStore
} from './osmTiles.js';
import { describeError, runSource } from './sourceRunner.js';

/**
 * Choix de la source des lieux OSM selon rules.osm.source (surchargeable
 * par app_config, clé "osm.source") : tuiles statiques, Overpass, ou rien.
 * La source "osm" de la réponse places indique en plus : source utilisée
 * (source), date des données (dataDate) et nombre de tuiles lues (tilesRead)
 * en mode tuiles ; durationMs y compte aussi la lecture de la version en
 * service et du cache, et timings la détaille (lookup : cache partagé,
 * index : manifeste, tiles : lecture des tuiles, en ms depuis le début).
 *
 * Rapidité en mode tuiles : le pointeur current.json arrive avec la
 * configuration (ctx.osmPointer, lue à chaque requête de toute façon), donc
 * le cache partagé est interrogé tout de suite, en parallèle du manifeste
 * et des tuiles ; les réponses sont aussi gardées en mémoire, et le cache
 * partagé est écrit après la réponse.
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
 * (appConfig.js) : { dataDate, manifest }, ou null hors mode tuiles ou si la
 * version en service est illisible (places retentera la lecture).
 * @param {any} rules
 * @param {{ tileStore?: import('./osmTiles.js').TileStore }} [ctx]
 * @returns {Promise<{ dataDate: string, manifest: string } | null>}
 */
export async function readOsmPointer(rules, ctx = {}) {
  if (osmSourceSetting(rules) !== 'tiles') return null;
  try {
    const pointer = await loadTilesPointer(rules, storeOf(ctx));
    return typeof pointer.dataDate === 'string' && typeof pointer.manifest === 'string' ? { dataDate: pointer.dataDate, manifest: pointer.manifest } : null;
  } catch (err) {
    log('warn', 'osm_tiles_pointer_failed', { message: describeError(err) });
    return null;
  }
}

/**
 * Source OSM active et date des données en service (fonction config, écran
 * « À propos », /debug).
 * @param {any} rules
 * @param {{ dataDate: string } | null | undefined} pointer
 * @returns {{ source: 'tiles' | 'overpass' | 'off', dataDate: string | null }}
 */
export function osmInfo(rules, pointer) {
  const source = osmSourceSetting(rules);
  return { source, dataDate: source === 'tiles' ? (pointer?.dataDate ?? null) : null };
}

/**
 * Lieux OSM (restaurants, marchés, nature, petit patrimoine) autour du point.
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {boolean} includeRestaurants
 * @param {import('../providers/types.js').ProviderContext & { tileStore?: import('./osmTiles.js').TileStore }} ctx
 */
export async function osmPlacesSource(point, radiusKm, includeRestaurants, ctx) {
  const setting = osmSourceSetting(ctx.rules);
  const params = { lat: point.lat, lon: point.lon, radius: radiusKm, lang: ctx.lang, restaurants: includeRestaurants };
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
  const meta = { source: 'tiles', dataDate: pointer.dataDate };
  // Date des données dans la clé : une nouvelle version invalide le cache.
  const key = cacheKey('osm-tiles', { ...params, data: pointer.dataDate });
  const remembered = recallResponse(key);
  if (remembered) return { name: 'osm', status: 'cache', durationMs: since(started), ...meta, tilesRead: 0, timings, data: remembered };

  // Cache partagé, manifeste et tuiles en parallèle : un aller-retour vers
  // la base coûte autant que la lecture des tuiles.
  const stats = { tilesRead: 0 };
  const lookup = ctx.cache
    .lookup(key)
    .catch(() => undefined)
    .finally(() => (timings.lookup = since(started)));
  const read = tilesIndex('osm', { ...ctx, osmPointer: pointer }, started).then(async (loaded) => {
    timings.index = since(started);
    if (loaded.failed) return loaded;
    if (!isCovered(loaded.index, ctx.countryCode)) return { notCovered: true };
    try {
      const data = await fetchOsmTilePlaces(point, radiusKm, { rules: ctx.rules, lang: ctx.lang, includeRestaurants, index: loaded.index, store: storeOf(ctx), stats });
      return { data };
    } catch (error) {
      return { error };
    } finally {
      timings.tiles = since(started);
    }
  });
  const entry = await lookup;
  if (entry?.fresh) {
    rememberResponse(key, entry.value);
    return { name: 'osm', status: 'cache', durationMs: since(started), ...meta, tilesRead: 0, timings, data: entry.value };
  }
  const result = await read;
  // Pays pas encore importé : ce n'est pas une panne, la génération continue sans ces lieux.
  if (result.notCovered) return { name: 'osm', status: 'failed', message: 'not_covered', durationMs: since(started), ...meta };
  const failure = result.failed?.message ?? (result.error ? describeError(result.error) : null);
  if (failure) {
    if (result.error) log('warn', 'source_failed', { source: 'osm', message: failure, stale: Boolean(entry) });
    if (entry) return { name: 'osm', status: 'cache', message: 'stale', durationMs: since(started), ...meta, tilesRead: 0, timings, data: entry.value };
    return { name: 'osm', status: 'failed', message: failure, durationMs: since(started), ...meta };
  }
  const { data } = result;
  rememberResponse(key, data);
  // Écriture du cache partagé après la réponse (sinon attendue : tests, Node).
  const write = ctx.cache.set(key, 'osm-tiles', data, ctx.rules.cacheTtlSec.osm).catch(() => {});
  if (globalThis.EdgeRuntime?.waitUntil) globalThis.EdgeRuntime.waitUntil(write);
  else await write;
  return { name: 'osm', status: 'ok', durationMs: since(started), ...meta, tilesRead: stats.tilesRead, timings, data };
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
    return runSource({ ...base, cacheSource: 'osm-heritage', params, fetcher: () => fetchOsmHeritage(point, radiusKm, { rules: ctx.rules, lang: ctx.lang }) });
  }
  const loaded = await tilesIndex('heritage-osm', ctx, Date.now());
  if (loaded.failed) return loaded.failed;
  const { index } = loaded;
  // Pays sans tuiles : échec immédiat, sans attendre de délai.
  if (!isCovered(index, ctx.countryCode)) return { name: 'heritage-osm', status: 'failed', message: 'not_covered' };
  return runSource({
    ...base,
    cacheSource: 'osm-heritage-tiles',
    params: { ...params, data: index.dataDate },
    fetcher: () => fetchOsmTileHeritage(point, radiusKm, { rules: ctx.rules, lang: ctx.lang, index, store: storeOf(ctx) })
  });
}
