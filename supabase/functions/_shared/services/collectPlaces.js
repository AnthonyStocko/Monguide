import { dedupePlaces } from '../domain/dedupePlaces.js';
import { isPlace } from '../domain/model.js';
import { fetchOsmPlaces } from './osm.js';
import { runSource } from './sourceRunner.js';

/**
 * Rassemble en parallèle les lieux autour d'une destination : patrimoine et
 * terroir du fournisseur du pays, lieux OpenStreetMap (communs à tous les
 * pays). Une source en échec n'empêche jamais la réponse.
 *
 * @param {import('../providers/types.js').CountryProvider} provider
 * @param {import('../providers/types.js').Point} point position arrondie
 * @param {number} radiusKm
 * @param {{ lunch: 'market' | 'restaurant' | 'both' }} options
 * @param {import('../providers/types.js').ProviderContext} ctx
 */
export async function collectPlaces(provider, point, radiusKm, { lunch }, ctx) {
  const includeRestaurants = lunch !== 'market';
  const [heritage, osm, terroir] = await Promise.all([
    provider.heritage(point, radiusKm, ctx),
    runSource({
      name: 'osm',
      cacheSource: 'osm',
      params: { lat: point.lat, lon: point.lon, radius: radiusKm, lang: ctx.lang, restaurants: includeRestaurants },
      ttlSec: ctx.rules.cacheTtlSec.osm,
      cache: ctx.cache,
      fetcher: () => fetchOsmPlaces(point, radiusKm, { rules: ctx.rules, lang: ctx.lang, includeRestaurants })
    }),
    provider.terroir(point, ctx)
  ]);

  const outcomes = [...heritage, osm, terroir];
  const places = dedupePlaces(
    [...heritage.flatMap((o) => o.data ?? []), ...(osm.data ?? [])].filter(isPlace),
    ctx.rules.places.dedupDistanceM
  );
  return {
    places,
    appellations: terroir.data ?? [],
    // État de chaque source, sans ses données (durée et requête incluses pour le diagnostic).
    sources: outcomes.map(({ data, ...source }) => source)
  };
}
