import { cacheLookup, cacheSet } from '../_shared/cache.js';
import { roundCoord } from '../_shared/domain/geo.js';
import { SEARCHABLE_CATEGORIES, pagePlaces } from '../_shared/domain/pagePlaces.js';
import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { getProvider } from '../_shared/providers/index.js';
import { collectPlaces } from '../_shared/services/collectPlaces.js';
import { readEnum, readEnumList, readJsonBody, readNumber, readPoint, readString } from '../_shared/validate.js';

// POST /functions/v1/places { lat, lon, radiusKm, countryCode, profile, lunch, lang, categories?, offset? }
// -> { places, appellations, sources } ; avec categories ou offset (« Plus de résultats ») :
// une page de rules.places.pageSize lieux, + total et nextOffset (docs/api.md)
serveFunction({
  name: 'places',
  methods: ['POST'],
  handle: async ({ req, appConfig }) => {
    const { rules } = appConfig;
    const body = await readJsonBody(req);
    const exact = readPoint(body.lat, body.lon);
    // Position arrondie (~1 km) : partage du cache entre utilisateurs, aucune position exacte transmise.
    const point = { lat: roundCoord(exact.lat), lon: roundCoord(exact.lon) };
    const radiusKm = readNumber(body.radiusKm, 'radiusKm', { min: 1, max: rules.places.maxRadiusKm });
    const countryCode = readString(body.countryCode, 'countryCode', { min: 2, max: 2 });
    // Le profil sera utilisé par la génération (phase 4) ; il est déjà validé ici.
    readEnum(body.profile, 'profile', ['certified', 'balanced', 'explorer']);
    const lunch = readEnum(body.lunch, 'lunch', ['market', 'restaurant', 'both']);
    const lang = readEnum(body.lang, 'lang', ['fr', 'en'], 'fr');
    // Facultatifs, rétrocompatibles : sans eux, tous les lieux comme avant.
    const categories = readEnumList(body.categories, 'categories', SEARCHABLE_CATEGORIES);
    const offset = body.offset === undefined || body.offset === null ? undefined : readNumber(body.offset, 'offset', { min: 0, max: 10000 });
    if (offset !== undefined && !Number.isInteger(offset)) throw new AppError(400, 'invalid_input', 'offset: integer required');

    const provider = getProvider(countryCode);
    if (!provider) throw new AppError(400, 'unsupported_country', `Country not supported: ${countryCode}`);

    const ctx = { rules, lang, countryCode: countryCode.toUpperCase(), cache: { lookup: cacheLookup, set: cacheSet }, osmPointer: appConfig.osmPointer };
    // Restaurants demandés explicitement : cherchés même avec un déjeuner au marché.
    const result = await collectPlaces(provider, point, radiusKm, { lunch: categories?.includes('restaurant') ? 'restaurant' : lunch }, ctx);
    if (categories === undefined && offset === undefined) return result;
    return { ...result, ...pagePlaces(result.places, { point, categories, offset }, rules) };
  }
});
