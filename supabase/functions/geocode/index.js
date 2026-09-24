import { cached } from '../_shared/cache.js';
import { isSupportedCountry } from '../_shared/domain/config/countries.js';
import { roundCoord } from '../_shared/domain/geo.js';
import { serveFunction } from '../_shared/handler.js';
import { reverseCity, searchCities } from '../_shared/services/geocoding.js';
import { timezoneAt } from '../_shared/services/timezone.js';
import { readEnum, readPoint, readString } from '../_shared/validate.js';

/**
 * Ajoute le fuseau horaire (déterminé par la position, mis en cache) aux
 * destinations prises en charge ; null pour les autres, que l'application
 * signale comme "pas encore prises en charge".
 */
function withTimezones(results, ttlSec) {
  return Promise.all(
    results.map(async (r) => {
      if (!isSupportedCountry(r.countryCode)) return { ...r, timezone: null };
      const point = { lat: roundCoord(r.lat), lon: roundCoord(r.lon) };
      const timezone = await cached('timezone', point, ttlSec, () => timezoneAt(point));
      return { ...r, timezone };
    })
  );
}

// GET /functions/v1/geocode?q=…&lang=…  ou  ?lat=…&lon=…&lang=…  (docs/api.md)
serveFunction({
  name: 'geocode',
  methods: ['GET'],
  handle: async ({ req, appConfig }) => {
    const { rules } = appConfig;
    const params = new URL(req.url).searchParams;
    const lang = readEnum(params.get('lang'), 'lang', ['fr', 'en'], 'fr');
    const ttlSec = rules.cacheTtlSec.geocode;

    let results;
    if (params.has('lat') || params.has('lon')) {
      const exact = readPoint(params.get('lat'), params.get('lon'));
      // Position arrondie (~1 km) : suffisant pour trouver la commune, jamais conservée exacte.
      const point = { lat: roundCoord(exact.lat), lon: roundCoord(exact.lon) };
      results = await cached('geocode-reverse', { ...point, lang }, ttlSec, () => reverseCity(point, lang));
    } else {
      const q = readString(params.get('q'), 'q', { min: rules.geocode.minChars, max: 100 });
      results = await cached('geocode', { q, lang }, ttlSec, () => searchCities(q, lang, rules.geocode.maxResults));
    }
    return { results: await withTimezones(results, rules.cacheTtlSec.admin) };
  }
});
