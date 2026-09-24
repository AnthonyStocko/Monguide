import { cached } from '../_shared/cache.js';
import { daysBetween } from '../_shared/domain/dates.js';
import { roundCoord } from '../_shared/domain/geo.js';
import { buildWeatherDays } from '../_shared/domain/weatherDays.js';
import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { fetchHourlyForecast } from '../_shared/services/weather.js';
import { readDate, readPoint, readTimeZone } from '../_shared/validate.js';

/** Durée maximale d'un séjour accepté, en jours. */
const MAX_TRIP_DAYS = 62;

// GET /functions/v1/weather?lat&lon&timezone&startDate&endDate -> { days } (docs/api.md)
serveFunction({
  name: 'weather',
  methods: ['GET'],
  handle: async ({ req, appConfig }) => {
    const params = new URL(req.url).searchParams;
    const exact = readPoint(params.get('lat'), params.get('lon'));
    const point = { lat: roundCoord(exact.lat), lon: roundCoord(exact.lon) };
    const timezone = readTimeZone(params.get('timezone'));
    const startDate = readDate(params.get('startDate'), 'startDate');
    const endDate = readDate(params.get('endDate'), 'endDate');
    const span = daysBetween(startDate, endDate);
    if (span < 0 || span >= MAX_TRIP_DAYS) {
      throw new AppError(400, 'invalid_input', `endDate: must be between startDate and startDate + ${MAX_TRIP_DAYS - 1} days`);
    }

    // La prévision complète (16 jours) est mise en cache, quelles que soient les dates demandées.
    const hourly = await cached('weather', { ...point, timezone }, appConfig.rules.cacheTtlSec.weather, () =>
      fetchHourlyForecast(point, timezone)
    );
    return { days: buildWeatherDays(hourly, startDate, endDate) };
  }
});
