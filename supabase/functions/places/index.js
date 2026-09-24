import { cacheLookup, cacheSet } from '../_shared/cache.js';
import { roundCoord } from '../_shared/domain/geo.js';
import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { getProvider } from '../_shared/providers/index.js';
import { collectPlaces } from '../_shared/services/collectPlaces.js';
import { readEnum, readJsonBody, readNumber, readPoint, readString } from '../_shared/validate.js';

// POST /functions/v1/places { lat, lon, radiusKm, countryCode, profile, lunch, lang }
// -> { places, appellations, sources } (docs/api.md)
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

    const provider = getProvider(countryCode);
    if (!provider) throw new AppError(400, 'unsupported_country', `Country not supported: ${countryCode}`);

    const ctx = { rules, lang, countryCode: countryCode.toUpperCase(), cache: { lookup: cacheLookup, set: cacheSet } };
    return collectPlaces(provider, point, radiusKm, { lunch }, ctx);
  }
});
