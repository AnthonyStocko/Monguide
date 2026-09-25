import { cached, cacheLookup, cacheSet } from '../_shared/cache.js';
import { daysBetween, eachDate } from '../_shared/domain/dates.js';
import { distanceKm, roundCoord } from '../_shared/domain/geo.js';
import { generateTrip } from '../_shared/domain/generateTrip.js';
import { validateTripRequest } from '../_shared/domain/validateTripRequest.js';
import { buildWeatherDays } from '../_shared/domain/weatherDays.js';
import { AppError } from '../_shared/errors.js';
import { fuelPricesEu } from '../_shared/fuelPricesEu.js';
import { serveFunction } from '../_shared/handler.js';
import { getProvider } from '../_shared/providers/index.js';
import { collectPlaces } from '../_shared/services/collectPlaces.js';
import { fetchHolidays, holidaysBetween } from '../_shared/services/holidays.js';
import { fetchHourlyForecast } from '../_shared/services/weather.js';
import { withDeadline } from '../_shared/services/withDeadline.js';
import { readJsonBody } from '../_shared/validate.js';

/** Zones de collecte hors destination au plus (hébergements éloignés). */
const MAX_EXTRA_ZONES = 2;

const round = (p) => ({ lat: roundCoord(p.lat), lon: roundCoord(p.lon) });

/** Laisse une collecte finir en arrière-plan (elle remplira le cache partagé). */
function keepAlive(promise) {
  globalThis.EdgeRuntime?.waitUntil?.(promise.catch(() => {}));
}

/**
 * Zones de collecte des lieux : la destination, plus les hébergements situés
 * hors du rayon (journées de transition, ex. Annecy -> Chamonix).
 */
function collectionZones(trip) {
  const zones = [round(trip.destination)];
  for (const l of trip.lodgings) {
    if (zones.length > MAX_EXTRA_ZONES) break;
    if (distanceKm(trip.destination, l) <= trip.destination.radiusKm) continue;
    const z = round(l);
    if (!zones.some((x) => distanceKm(x, z) < trip.destination.radiusKm)) zones.push(z);
  }
  return zones;
}

// POST /functions/v1/generate { tripRequest } -> { trip, warnings, sources } (docs/api.md)
serveFunction({
  name: 'generate',
  methods: ['POST'],
  rateLimitKind: 'generate',
  handle: async ({ req, appConfig }) => {
    const { rules } = appConfig;
    const body = await readJsonBody(req);
    const trip = body.tripRequest;
    const invalid = validateTripRequest(trip, rules);
    if (invalid.length) throw new AppError(400, 'invalid_input', `tripRequest: ${invalid.join(', ')}`);

    const countryCode = trip.destination.countryCode.toUpperCase();
    const provider = getProvider(countryCode);
    if (!provider) throw new AppError(400, 'unsupported_country', `Country not supported: ${countryCode}`);
    const lang = ['fr', 'en'].includes(body.lang) ? body.lang : 'fr';
    const ctx = { rules, lang, countryCode, cache: { lookup: cacheLookup, set: cacheSet }, fuelStore: fuelPricesEu, osmPointer: appConfig.osmPointer };
    const deadline = Date.now() + rules.generation.collectBudgetMs;
    const left = () => deadline - Date.now();
    const point = round(trip.destination);

    // Collecte en parallèle ; chaque source a son délai, et l'ensemble un budget global.
    const zones = collectionZones(trip);
    const placeJobs = zones.map((z) => collectPlaces(provider, z, trip.destination.radiusKm, { lunch: trip.lunch }, ctx));
    const weatherJob =
      daysBetween(trip.startDate, trip.endDate) >= 0
        ? cached('weather', { ...point, timezone: trip.timezone }, rules.cacheTtlSec.weather, () => fetchHourlyForecast(point, trip.timezone))
        : Promise.resolve(null);
    const years = [...new Set(eachDate(trip.startDate, trip.endDate).map((d) => Number(d.slice(0, 4))))];
    const holidaysJob = Promise.all(years.map((y) => cached('holidays', { country: countryCode, year: y }, rules.cacheTtlSec.holidays, () => fetchHolidays(countryCode, y))));
    const co2Job = provider.co2Factors(countryCode);
    const fuelJob = trip.mode === 'car' ? provider.fuel(point, trip.destination.radiusKm, ctx) : Promise.resolve(null);
    [...placeJobs, weatherJob, holidaysJob, fuelJob].forEach(keepAlive);

    const emptyPlaces = { places: [], appellations: [], sources: [] };
    const [placeResults, weather, holidays, co2, fuel] = await Promise.all([
      Promise.all(placeJobs.map((job) => withDeadline(job, left(), emptyPlaces))),
      withDeadline(weatherJob, left(), null),
      withDeadline(holidaysJob, left(), null),
      withDeadline(co2Job, left(), null),
      withDeadline(fuelJob, left(), null)
    ]);

    const sources = [];
    placeResults.forEach(({ value, timedOut }, i) => {
      const zone = i === 0 ? undefined : i;
      if (timedOut) sources.push({ name: 'places', status: 'failed', message: 'timeout', ...(zone ? { zone } : {}) });
      for (const s of value.sources) sources.push(zone ? { ...s, zone } : s);
    });
    sources.push({ name: 'weather', status: weather.value ? 'ok' : 'failed', ...(weather.timedOut ? { message: 'timeout' } : {}) });
    sources.push({ name: 'holidays', status: holidays.value ? 'ok' : 'failed', ...(holidays.timedOut ? { message: 'timeout' } : {}) });
    sources.push({ name: 'co2', status: co2.value ? 'ok' : 'failed' });
    if (trip.mode === 'car') {
      const f = fuel.value;
      // "cache" est un succès (prix servis par le cache partagé).
      const status = f && f.status !== 'failed' ? f.status : 'failed';
      sources.push({ name: 'fuel', status, ...(f?.message ? { message: f.message } : fuel.timedOut ? { message: 'timeout' } : {}) });
    }

    const { trip: generated, warnings } = generateTrip(
      {
        trip,
        places: placeResults.flatMap((r) => r.value.places),
        appellations: placeResults[0].value.appellations,
        weatherDays: weather.value ? buildWeatherDays(weather.value, trip.startDate, trip.endDate) : [],
        holidays: holidays.value ? holidaysBetween(holidays.value.flat(), trip.startDate, trip.endDate) : [],
        co2Factors: co2.value,
        fuel: fuel.value?.data ?? null,
        makeId: () => crypto.randomUUID()
      },
      rules
    );
    // Une alerte par source en échec (plusieurs zones peuvent échouer pareil) ;
    // not_covered : pays sans lieux OSM importés, message dédié.
    const failed = new Map();
    for (const s of sources) if (s.status === 'failed' && !failed.has(s.name)) failed.set(s.name, s.message === 'not_covered' ? { message: s.message } : {});
    for (const [name, extra] of [...failed].reverse()) warnings.unshift({ code: 'source_failed', source: name, ...extra });
    return { trip: { ...generated, updatedAt: new Date().toISOString() }, warnings, sources: sources.map(({ query, ...s }) => s) };
  }
});
