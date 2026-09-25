import { log } from '../log.js';
import { fetchOsmHeritage, fetchOsmPlaces } from './osm.js';
import { fetchOsmTileHeritage, fetchOsmTilePlaces, isCovered, loadTilesIndex, osmSourceSetting, storageTileStore } from './osmTiles.js';
import { describeError, runSource } from './sourceRunner.js';

/**
 * Choix de la source des lieux OSM selon rules.osm.source (surchargeable
 * par app_config, clé "osm.source") : tuiles statiques, Overpass, ou rien.
 * La source "osm" de la réponse places indique en plus : source utilisée
 * (source), date des données (dataDate) et nombre de tuiles lues (tilesRead)
 * en mode tuiles ; durationMs y compte aussi la lecture de la version en
 * service et du cache.
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
  const stats = { tilesRead: 0 };
  const outcome = await runSource({
    name: 'osm',
    cacheSource: 'osm-tiles',
    // Date des données dans la clé : une nouvelle version invalide le cache.
    params: { ...params, data: index.dataDate },
    ttlSec: ctx.rules.cacheTtlSec.osm,
    cache: ctx.cache,
    fetcher: () => fetchOsmTilePlaces(point, radiusKm, { rules: ctx.rules, lang: ctx.lang, includeRestaurants, index, store: storeOf(ctx), stats })
  });
  return { ...outcome, durationMs: Date.now() - started, source: 'tiles', dataDate: index.dataDate, tilesRead: stats.tilesRead };
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
