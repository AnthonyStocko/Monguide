import { cached } from '../_shared/cache.js';
import { isSupportedCountry } from '../_shared/domain/config/countries.js';
import { roundCoord } from '../_shared/domain/geo.js';
import { serveFunction } from '../_shared/handler.js';
import { reverseAddress, reverseCity, searchAddresses, searchCities } from '../_shared/services/geocoding.js';
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

/** Commune : recherche (q) ou recherche inverse (lat, lon). */
async function cities(params, lang, rules) {
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
  return withTimezones(results, rules.cacheTtlSec.admin);
}

/**
 * Adresse précise (hébergement) : recherche (q, favorisant la destination
 * biasLat/biasLon) ou adresse d'une position (lat, lon). La recherche inverse
 * n'est pas mise en cache partagé (une position arrondie à 1 km donnerait une
 * mauvaise adresse) ; la position est transmise à Photon arrondie à ~10 m.
 */
async function addresses(params, lang, rules) {
  if (params.has('lat') || params.has('lon')) {
    const exact = readPoint(params.get('lat'), params.get('lon'));
    return reverseAddress({ lat: roundCoord(exact.lat, 4), lon: roundCoord(exact.lon, 4) }, lang);
  }
  const q = readString(params.get('q'), 'q', { min: rules.geocode.minChars, max: 150 });
  let bias = null;
  if (params.has('biasLat') || params.has('biasLon')) {
    const b = readPoint(params.get('biasLat'), params.get('biasLon'));
    // Arrondi à 0,1° (~10 km) : suffisant pour favoriser la destination, et partage du cache.
    bias = { lat: roundCoord(b.lat, 1), lon: roundCoord(b.lon, 1) };
  }
  const key = { q, lang, ...(bias ? { biasLat: String(bias.lat), biasLon: String(bias.lon) } : {}) };
  return cached('geocode-address', key, rules.cacheTtlSec.geocode, () => searchAddresses(q, lang, rules.geocode.maxResults, bias));
}

// GET /functions/v1/geocode?kind=city|address&q=…&lang=…  ou  ?lat=…&lon=…  (docs/api.md)
serveFunction({
  name: 'geocode',
  methods: ['GET'],
  handle: async ({ req, appConfig }) => {
    const params = new URL(req.url).searchParams;
    const lang = readEnum(params.get('lang'), 'lang', ['fr', 'en'], 'fr');
    const kind = readEnum(params.get('kind'), 'kind', ['city', 'address'], 'city');
    const results = kind === 'address' ? await addresses(params, lang, appConfig.rules) : await cities(params, lang, appConfig.rules);
    return { results };
  }
});
