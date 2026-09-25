import { countryInfo } from '../../domain/config/countries.js';
import { osmHeritageFallback } from '../../services/osmSource.js';
import { runSource } from '../../services/sourceRunner.js';
import { bindingsToPlaces, buildMonumentsQuery, buildMuseumsQuery, labelLanguages, runSparql } from '../../services/wikidata.js';

/**
 * Patrimoine hors de France : Wikidata (monuments protégés, musées
 * référencés), deux requêtes séparées mises en cache 7 jours. Si une requête
 * échoue (sans copie en cache), repli sur OpenStreetMap (heritage=1|2,
 * tourism=museum ; tuiles ou Overpass selon rules.osm.source, aucun repli
 * avec "off") : la source porte alors le message "fallback_osm", que
 * l'application signale à l'utilisateur. La requête Wikidata n'est jamais
 * relancée.
 *
 * @param {import('../types.js').Point} point
 * @param {number} radiusKm
 * @param {import('../types.js').ProviderContext} ctx
 */
export async function heritage(point, radiusKm, ctx) {
  const { rules, lang, cache } = ctx;
  const languages = labelLanguages(lang, countryInfo(ctx.countryCode)?.languages ?? []);
  const params = { lat: point.lat, lon: point.lon, radius: radiusKm, lang };
  const ttlSec = rules.cacheTtlSec.wikidata;
  const { timeoutSec, limit } = rules.wikidata;

  const monumentsQuery = buildMonumentsQuery(point, radiusKm, languages, limit);
  const museumsQuery = buildMuseumsQuery(point, radiusKm, languages, limit);
  const [monuments, museums] = await Promise.all([
    runSource({
      name: 'monuments',
      cacheSource: 'wikidata-monuments',
      params,
      ttlSec,
      cache,
      query: monumentsQuery,
      fetcher: async () => bindingsToPlaces(await runSparql(monumentsQuery, timeoutSec), 'monument')
    }),
    runSource({
      name: 'museums',
      cacheSource: 'wikidata-museums',
      params,
      ttlSec,
      cache,
      query: museumsQuery,
      fetcher: async () => bindingsToPlaces(await runSparql(museumsQuery, timeoutSec), 'museum')
    })
  ]);
  if (monuments.status !== 'failed' && museums.status !== 'failed') return [monuments, museums];

  // Repli OpenStreetMap : une seule lecture pour les deux sources.
  const fallback = await osmHeritageFallback(point, radiusKm, params, ctx);
  if (!fallback) return [monuments, museums];
  const replace = (outcome, key) => {
    if (outcome.status !== 'failed') return outcome;
    if (fallback.status === 'failed') return { ...outcome, message: `${outcome.message}; fallback_osm_failed` };
    const { query, durationMs } = outcome;
    return { name: outcome.name, status: fallback.status, message: 'fallback_osm', durationMs, query, data: fallback.data[key] };
  };
  return [replace(monuments, 'monuments'), replace(museums, 'museums')];
}
