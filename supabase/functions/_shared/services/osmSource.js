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
 * service et du cache. En mode tuiles, les réponses sont aussi gardées en
 * mémoire, et le cache partagé est écrit après la réponse.
 */

/** Magasin des tuiles : ctx.tileStore dans les tests, bucket privé sinon. */
const storeOf = (ctx) => ctx.tileStore ?? storageTileStore();

/**
 * Version en service des tuiles, ou résultat "failed" de la source name.
 * @returns {Promise<{ index: any } | { failed: import('./sourceRunner.js').SourceOutcome<never> }>}
 */
async function tilesIndex(name, ctx, started) {
  try {
    return { index: await loadTilesIndex(ctx.rules, storeOf(ctx)) };
  } catch (err) {
    const message = describeError(err);
    log('warn', 'source_failed', { source: name, message, stale: false });
    return { failed: { name, status: 'failed', message, durationMs: Date.now() - started, source: 'tiles' } };
  }
}

/**
 * Source OSM active et date des données en service (fonction config, écran
 * « À propos ») ; dataDate null hors mode tuiles ou si la version en service
 * est illisible.
 * @param {any} rules
 * @param {{ tileStore?: import('./osmTiles.js').TileStore }} [ctx]
 * @returns {Promise<{ source: 'tiles' | 'overpass' | 'off', dataDate: string | null }>}
 */
export async function osmInfo(rules, ctx = {}) {
  const source = osmSourceSetting(rules);
  if (source !== 'tiles') return { source, dataDate: null };
  try {
    const pointer = await loadTilesPointer(rules, storeOf(ctx));
    return { source, dataDate: typeof pointer.dataDate === 'string' ? pointer.dataDate : null };
  } catch (err) {
    log('warn', 'osm_tiles_pointer_failed', { message: describeError(err) });
    return { source, dataDate: null };
  }
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
  const loaded = await tilesIndex('osm', ctx, started);
  if (loaded.failed) return loaded.failed;
  const { index } = loaded;
  // Pays pas encore importé : ce n'est pas une panne, la génération continue sans ces lieux.
  if (!isCovered(index, ctx.countryCode)) {
    return { name: 'osm', status: 'failed', message: 'not_covered', durationMs: Date.now() - started, source: 'tiles', dataDate: index.dataDate };
  }
  const meta = { source: 'tiles', dataDate: index.dataDate };
  // Date des données dans la clé : une nouvelle version invalide le cache.
  const key = cacheKey('osm-tiles', { ...params, data: index.dataDate });
  const remembered = recallResponse(key);
  if (remembered) return { name: 'osm', status: 'cache', durationMs: Date.now() - started, ...meta, tilesRead: 0, data: remembered };

  // Cache partagé et tuiles en parallèle : un aller-retour vers la base coûte
  // autant que la lecture des tuiles, souvent déjà en mémoire.
  const stats = { tilesRead: 0 };
  const lookup = ctx.cache.lookup(key).catch(() => undefined);
  const read = fetchOsmTilePlaces(point, radiusKm, { rules: ctx.rules, lang: ctx.lang, includeRestaurants, index, store: storeOf(ctx), stats }).then(
    (data) => ({ data }),
    (error) => ({ error })
  );
  const entry = await lookup;
  if (entry?.fresh) {
    rememberResponse(key, entry.value);
    return { name: 'osm', status: 'cache', durationMs: Date.now() - started, ...meta, tilesRead: 0, data: entry.value };
  }
  const { data, error } = await read;
  if (error) {
    const message = describeError(error);
    log('warn', 'source_failed', { source: 'osm', message, stale: Boolean(entry) });
    if (entry) return { name: 'osm', status: 'cache', message: 'stale', durationMs: Date.now() - started, ...meta, tilesRead: 0, data: entry.value };
    return { name: 'osm', status: 'failed', message, durationMs: Date.now() - started, ...meta };
  }
  rememberResponse(key, data);
  // Écriture du cache partagé après la réponse (sinon attendue : tests, Node).
  const write = ctx.cache.set(key, 'osm-tiles', data, ctx.rules.cacheTtlSec.osm).catch(() => {});
  if (globalThis.EdgeRuntime?.waitUntil) globalThis.EdgeRuntime.waitUntil(write);
  else await write;
  return { name: 'osm', status: 'ok', durationMs: Date.now() - started, ...meta, tilesRead: stats.tilesRead, data };
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
