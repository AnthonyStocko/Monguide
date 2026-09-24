import { cached } from '../_shared/cache.js';
import { roundCoord } from '../_shared/domain/geo.js';
import { serveFunction } from '../_shared/handler.js';
import { reverseCity, searchCities } from '../_shared/services/geocoding.js';
import { readEnum, readPoint, readString } from '../_shared/validate.js';

// GET /functions/v1/geocode?q=…&lang=…  ou  ?lat=…&lon=…&lang=…  (docs/api.md)
serveFunction({
  name: 'geocode',
  methods: ['GET'],
  handle: async ({ req, appConfig }) => {
    const { rules } = appConfig;
    const params = new URL(req.url).searchParams;
    const lang = readEnum(params.get('lang'), 'lang', ['fr', 'en'], 'fr');
    const ttlSec = rules.cacheTtlSec.geocode;

    if (params.has('lat') || params.has('lon')) {
      const exact = readPoint(params.get('lat'), params.get('lon'));
      // Position arrondie (~1 km) : suffisant pour trouver la commune, jamais conservée exacte.
      const point = { lat: roundCoord(exact.lat), lon: roundCoord(exact.lon) };
      const results = await cached('geocode-reverse', { ...point, lang }, ttlSec, () => reverseCity(point, lang));
      return { results };
    }

    const q = readString(params.get('q'), 'q', { min: rules.geocode.minChars, max: 100 });
    const results = await cached('geocode', { q, lang }, ttlSec, () => searchCities(q, lang, rules.geocode.maxResults));
    return { results };
  }
});
