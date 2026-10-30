import { countryInfo } from '../../domain/config/countries.js';
import { osmHeritageFallback } from '../../services/osmSource.js';
import { runSource } from '../../services/sourceRunner.js';
import { articleLanguages, bindingsToPlaces, buildMonumentsQuery, buildMuseumsQuery, labelLanguages, nameLanguages, runSparql } from '../../services/wikidata.js';

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
  const local = countryInfo(ctx.countryCode)?.languages ?? [];
  const languages = labelLanguages(lang, local);
  const wikis = articleLanguages(lang, local);
  const names = nameLanguages(lang, local);
  const params = { lat: point.lat, lon: point.lon, radius: radiusKm, lang };
  const ttlSec = rules.cacheTtlSec.wikidata;
  const { timeoutSec, limit } = rules.wikidata;

  const monumentsQuery = buildMonumentsQuery(point, radiusKm, languages, limit, wikis, names);
  const museumsQuery = buildMuseumsQuery(point, radiusKm, languages, limit, wikis, names);
  const [monuments, museums] = await Promise.all([
    runSource({
      name: 'monuments',
      cacheSource: 'wikidata-monuments',
      // Les plus proches d'abord (buildMonumentsQuery), avec signaux de notoriété : nouvelle clé,
      // les échantillons d'avant ne sont plus servis.
      params: { ...params, order: 'distance', signals: 2 },
      ttlSec,
      cache,
      query: monumentsQuery,
      fetcher: async () => bindingsToPlaces(await runSparql(monumentsQuery, timeoutSec), 'monument', { lang, localLanguages: local })
    }),
    runSource({
      name: 'museums',
      cacheSource: 'wikidata-museums',
      params: { ...params, signals: 2 },
      ttlSec,
      cache,
      query: museumsQuery,
      fetcher: async () => bindingsToPlaces(await runSparql(museumsQuery, timeoutSec), 'museum', { lang, localLanguages: local })
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
