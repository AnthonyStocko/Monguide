import { reviewTrip } from '../_shared/ai/reviewTrip.js';
import { addReviewStats, supabaseUsageStore } from '../_shared/ai/usageStore.js';
import { cached, cacheLookup, cacheSet } from '../_shared/cache.js';
import { daysBetween, eachDate } from '../_shared/domain/dates.js';
import { distanceKm, roundCoord } from '../_shared/domain/geo.js';
import { generateTrip } from '../_shared/domain/generateTrip.js';
import { validateTripRequest } from '../_shared/domain/validateTripRequest.js';
import { cleanWishes } from '../_shared/domain/wishes.js';
import { includesRestaurants } from '../_shared/domain/tripDraft.js';
import { buildWeatherDays } from '../_shared/domain/weatherDays.js';
import { AppError } from '../_shared/errors.js';
import { fuelPricesEu } from '../_shared/fuelPricesEu.js';
import { serveFunction } from '../_shared/handler.js';
import { ndjsonResponse } from '../_shared/respond.js';
import { getProvider } from '../_shared/providers/index.js';
import { clientId } from '../_shared/rateLimit.js';
import { collectPlaces } from '../_shared/services/collectPlaces.js';
import { createProgress } from '../_shared/services/generationProgress.js';
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

/**
 * Génération complète : génération déterministe (generateTrip), puis
 * relecture facultative par une IA (reviewTrip : consentement, ai.enabled,
 * quota ; 8 s au plus ; tout échec livre le planning généré). progress :
 * suivi des étapes (createProgress), dont les événements partent en flux
 * quand l'application le demande.
 */
async function generate({ trip, lang, countryCode, provider, appConfig, review, client }, progress) {
  const { rules } = appConfig;
  const ctx = { rules, lang, countryCode, cache: { lookup: cacheLookup, set: cacheSet }, fuelStore: fuelPricesEu, osmPointer: appConfig.osmPointer };
  const deadline = Date.now() + rules.generation.collectBudgetMs;
  const left = () => deadline - Date.now();
  const point = round(trip.destination);

  // Collecte en parallèle ; chaque source a son délai, et l'ensemble un budget global.
  const zones = collectionZones(trip);
  progress.start();
  const placeJobs = zones.map((z) => collectPlaces(provider, z, trip.destination.radiusKm, { lunch: trip.lunch, dinner: trip.dinner }, ctx, progress.report));
  const weatherJob = (
    daysBetween(trip.startDate, trip.endDate) >= 0
      ? cached('weather', { ...point, timezone: trip.timezone }, rules.cacheTtlSec.weather, () => fetchHourlyForecast(point, trip.timezone))
      : Promise.resolve(null)
  ).then(
    (value) => {
      progress.report('weather', value ? 'done' : 'failed');
      return value;
    },
    (err) => {
      progress.report('weather', 'failed');
      throw err;
    }
  );
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

  progress.timeoutPending();
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

  progress.planningStarted();
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
  // Lieux OSM partiels : pays voisins pris en charge mais pas encore importés, toutes zones confondues.
  const missing = [...new Set(sources.flatMap((s) => s.missingCountries ?? []))].sort();
  if (missing.length) warnings.splice(failed.size, 0, { code: 'places_partial', countries: missing });
  progress.planningDone();

  // Relecture par une IA : génération initiale seulement (jamais lors d'un recalcul de journée).
  const reviewed = await reviewTrip(generated, {
    rules,
    language: lang,
    consent: review.consent,
    wishes: review.wishes,
    client,
    usageStore: supabaseUsageStore,
    recordStats: addReviewStats,
    onStart: () => progress.reviewStarted(),
    onDone: (status) => progress.reviewDone(status)
  });
  return { trip: { ...reviewed, updatedAt: new Date().toISOString() }, warnings, sources: sources.map(({ query, ...s }) => s) };
}

// POST /functions/v1/generate { tripRequest } -> { trip, warnings, sources } (docs/api.md) ;
// avec Accept: application/x-ndjson, progression en flux puis { event: "result", ... }.
serveFunction({
  name: 'generate',
  methods: ['POST'],
  rateLimitKind: 'generate',
  handle: async ({ req, caller, appConfig }) => {
    const { rules } = appConfig;
    const body = await readJsonBody(req);
    const trip = body.tripRequest;
    const invalid = validateTripRequest(trip, rules);
    if (invalid.length) throw new AppError(400, 'invalid_input', `tripRequest: ${invalid.join(', ')}`);

    const countryCode = trip.destination.countryCode.toUpperCase();
    const provider = getProvider(countryCode);
    if (!provider) throw new AppError(400, 'unsupported_country', `Country not supported: ${countryCode}`);
    const lang = ['fr', 'en'].includes(body.lang) ? body.lang : 'fr';
    // Relecture par une IA (facultatif) : consentement de l'utilisateur ; « Vos envies » dans trip.params
    // (longueur déjà vérifiée par validateTripRequest), nettoyé à nouveau ici.
    const review = { consent: body.review?.consent === true, wishes: cleanWishes(trip.params?.wishes) || undefined };
    const input = { trip, lang, countryCode, provider, appConfig, review, client: () => clientId(req, caller) };
    const restaurants = includesRestaurants(trip.lunch, trip.dinner);
    const zones = collectionZones(trip).length;

    if ((req.headers.get('accept') ?? '').includes('application/x-ndjson')) {
      return ndjsonResponse((send) => generate(input, createProgress({ send, zones, restaurants })));
    }
    return generate(input, createProgress({ send: () => {}, zones, restaurants }));
  }
});
