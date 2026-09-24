import { cacheKey } from '../cacheKey.js';
import { log } from '../log.js';

/**
 * @template T
 * @typedef {object} SourceOutcome Résultat d'une source de données, jamais une exception.
 * @property {string} name nom de la source (ex. "monuments", "osm")
 * @property {'ok' | 'cache' | 'failed'} status
 * @property {string} [message] précision (ex. "stale", "upstream 429")
 * @property {T} [data] absent si status = "failed"
 */

function describeError(err) {
  if (err?.upstreamStatus) return `upstream ${err.upstreamStatus}`;
  if (err?.code) return err.code;
  return 'error';
}

/**
 * Interroge une source à travers le cache partagé, sans jamais lever
 * d'exception :
 *  - entrée fraîche en cache -> status "cache" ;
 *  - sinon appel de fetcher() -> status "ok" et mise en cache ;
 *  - en cas d'échec, copie expirée resservie -> status "cache", message "stale" ;
 *  - sinon status "failed".
 *
 * @template T
 * @param {{
 *   name: string,
 *   cacheSource: string,
 *   params: Record<string, unknown>,
 *   ttlSec: number,
 *   fetcher: () => Promise<T>,
 *   cache: { lookup: (key: string) => Promise<{ value: unknown, fresh: boolean } | undefined>, set: (key: string, source: string, value: unknown, ttlSec: number) => Promise<void> }
 * }} options cache injecté pour pouvoir tester sans base de données
 * @returns {Promise<SourceOutcome<T>>}
 */
export async function runSource({ name, cacheSource, params, ttlSec, fetcher, cache }) {
  const key = cacheKey(cacheSource, params);
  const entry = await cache.lookup(key).catch(() => undefined);
  if (entry?.fresh) return { name, status: 'cache', data: /** @type {T} */ (entry.value) };

  try {
    const data = await fetcher();
    await cache.set(key, cacheSource, data, ttlSec).catch(() => {});
    return { name, status: 'ok', data };
  } catch (err) {
    const message = describeError(err);
    log('warn', 'source_failed', { source: name, message, stale: Boolean(entry) });
    if (entry) return { name, status: 'cache', message: 'stale', data: /** @type {T} */ (entry.value) };
    return { name, status: 'failed', message };
  }
}
