import { cached } from '../_shared/cache.js';
import { isSupportedCountry } from '../_shared/domain/config/countries.js';
import { daysBetween } from '../_shared/domain/dates.js';
import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { fetchHolidays, holidaysBetween } from '../_shared/services/holidays.js';
import { readDate, readString } from '../_shared/validate.js';

/** Période maximale demandée, en jours. */
const MAX_DAYS = 400;

// GET /functions/v1/holidays?countryCode&startDate&endDate -> { holidays } (docs/api.md)
serveFunction({
  name: 'holidays',
  methods: ['GET'],
  handle: async ({ req, appConfig }) => {
    const params = new URL(req.url).searchParams;
    const countryCode = readString(params.get('countryCode'), 'countryCode', { min: 2, max: 2 }).toUpperCase();
    if (!isSupportedCountry(countryCode)) throw new AppError(400, 'unsupported_country', `Country not supported: ${countryCode}`);
    const startDate = readDate(params.get('startDate'), 'startDate');
    const endDate = readDate(params.get('endDate'), 'endDate');
    const span = daysBetween(startDate, endDate);
    if (span < 0 || span >= MAX_DAYS) throw new AppError(400, 'invalid_input', `endDate: must be between startDate and startDate + ${MAX_DAYS - 1} days`);

    const years = [];
    for (let y = Number(startDate.slice(0, 4)); y <= Number(endDate.slice(0, 4)); y += 1) years.push(y);
    const ttlSec = appConfig.rules.cacheTtlSec.holidays;
    const perYear = await Promise.all(years.map((year) => cached('holidays', { country: countryCode, year }, ttlSec, () => fetchHolidays(countryCode, year))));
    return { holidays: holidaysBetween(perYear.flat(), startDate, endDate) };
  }
});
