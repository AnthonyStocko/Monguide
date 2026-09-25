import { dedupePlaces } from '../domain/dedupePlaces.js';
import { isPlace } from '../domain/model.js';
import { osmPlacesSource } from './osmSource.js';

/**
 * Rassemble en parallèle les lieux autour d'une destination : patrimoine et
 * terroir du fournisseur du pays, lieux OpenStreetMap (communs à tous les
 * pays, tuiles statiques ou Overpass selon rules.osm.source). Une source en
 * échec n'empêche jamais la réponse.
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
    osmPlacesSource(point, radiusKm, includeRestaurants, ctx),
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
