import { dedupePlaces } from '../domain/dedupePlaces.js';
import { isPlace } from '../domain/model.js';
import { includesRestaurants } from '../domain/tripDraft.js';
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
 * @param {{ lunch: 'market' | 'restaurant' | 'both', dinner?: 'restaurant' | 'free' }} options restaurants
 *   collectés si le déjeuner ou le dîner en propose (includesRestaurants)
 * @param {import('../providers/types.js').ProviderContext} ctx
 * @param {(step: 'heritage' | 'places' | 'restaurants', status: 'done' | 'failed') => void} [onProgress]
 */
export async function collectPlaces(provider, point, radiusKm, { lunch, dinner }, ctx, onProgress = () => {}) {
  const includeRestaurants = includesRestaurants(lunch, dinner);
  // Progression réelle (fonction generate en flux) : chaque source signale sa fin dès qu'elle arrive.
  const ok = (outcomes) => (outcomes.every((o) => o.status === 'failed') ? 'failed' : 'done');
  const [heritage, osm, terroir] = await Promise.all([
    provider.heritage(point, radiusKm, ctx).then((outcomes) => {
      onProgress('heritage', ok(outcomes));
      return outcomes;
    }),
    osmPlacesSource(point, radiusKm, includeRestaurants, ctx).then((outcome) => {
      onProgress('places', ok([outcome]));
      // Restaurants : lus dans la même source OSM que les autres lieux.
      if (includeRestaurants) onProgress('restaurants', ok([outcome]));
      return outcome;
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
