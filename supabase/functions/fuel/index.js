import { cacheLookup, cacheSet } from '../_shared/cache.js';
import { roundCoord } from '../_shared/domain/geo.js';
import { AppError } from '../_shared/errors.js';
import { fuelPricesEu } from '../_shared/fuelPricesEu.js';
import { serveFunction } from '../_shared/handler.js';
import { getProvider } from '../_shared/providers/index.js';
import { readNumber, readPoint, readString } from '../_shared/validate.js';

// GET /functions/v1/fuel?lat&lon&radiusKm&countryCode -> { fuel, source } (docs/api.md)
serveFunction({
  name: 'fuel',
  methods: ['GET'],
  handle: async ({ req, appConfig }) => {
    const { rules } = appConfig;
    const params = new URL(req.url).searchParams;
    const exact = readPoint(params.get('lat'), params.get('lon'));
    const point = { lat: roundCoord(exact.lat), lon: roundCoord(exact.lon) };
    const radiusKm = readNumber(params.get('radiusKm'), 'radiusKm', { min: 1, max: rules.places.maxRadiusKm });
    const countryCode = readString(params.get('countryCode'), 'countryCode', { min: 2, max: 2 }).toUpperCase();
    const provider = getProvider(countryCode);
    if (!provider) throw new AppError(400, 'unsupported_country', `Country not supported: ${countryCode}`);

    const ctx = { rules, lang: 'fr', countryCode, cache: { lookup: cacheLookup, set: cacheSet }, fuelStore: fuelPricesEu };
    const { data, ...source } = await provider.fuel(point, radiusKm, ctx);
    return { fuel: data ?? null, source };
  }
});
