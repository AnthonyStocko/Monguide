import { cacheLookupMany, cacheSetMany } from '../_shared/cache.js';
import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { lookupImages } from '../_shared/services/imageLookup.js';
import { readJsonBody, readNumber, readPoint, readString } from '../_shared/validate.js';

/**
 * Identifiants Wikidata demandés : tableau de "Q…", doublons retirés.
 * @param {unknown} value
 * @param {number} max
 */
function readQids(value, max) {
  if (!Array.isArray(value)) throw new AppError(400, 'invalid_input', 'wikidataIds: array required');
  const qids = [...new Set(value)];
  if (qids.length > max) throw new AppError(400, 'invalid_input', `wikidataIds: at most ${max}`);
  if (!qids.every((q) => typeof q === 'string' && /^Q[1-9]\d{0,11}$/.test(q))) throw new AppError(400, 'invalid_input', 'wikidataIds: Q identifiers required');
  return qids;
}

// POST /functions/v1/images { wikidataIds, width, destination? } -> { images, destination? } (docs/api.md)
serveFunction({
  name: 'images',
  methods: ['POST'],
  handle: async ({ req, appConfig }) => {
    const { rules } = appConfig;
    const body = await readJsonBody(req);
    const qids = readQids(body.wikidataIds, rules.images.maxIds);
    const width = readNumber(body.width, 'width');
    if (!rules.images.widths.includes(width)) throw new AppError(400, 'invalid_input', `width: one of ${rules.images.widths.join(', ')}`);

    let destination;
    if (body.destination !== undefined && body.destination !== null) {
      const d = /** @type {Record<string, unknown>} */ (body.destination);
      if (typeof d !== 'object') throw new AppError(400, 'invalid_input', 'destination: object required');
      destination = {
        name: readString(d.name, 'destination.name', { min: 1, max: 100 }),
        countryCode: readString(d.countryCode, 'destination.countryCode', { min: 2, max: 2 }).toUpperCase(),
        ...readPoint(d.lat, d.lon)
      };
    }
    if (!qids.length && !destination) throw new AppError(400, 'invalid_input', 'wikidataIds: at least one identifier or a destination');

    return lookupImages({ qids, width, destination }, { cache: { lookupMany: cacheLookupMany, setMany: cacheSetMany }, rules });
  }
});
