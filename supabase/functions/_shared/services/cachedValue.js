import { cacheKey } from '../cacheKey.js';

/**
 * Valeur intermédiaire mise en cache (ex. monuments d'un département), avec
 * un cache injecté. Contrairement à runSource, une erreur remonte à
 * l'appelant ; une panne du cache est ignorée.
 * @template T
 * @param {{ lookup: Function, set: Function }} cache
 * @param {string} cacheSource
 * @param {Record<string, unknown>} params
 * @param {number} ttlSec
 * @param {() => Promise<T>} producer
 * @returns {Promise<T>}
 */
export async function cachedValue(cache, cacheSource, params, ttlSec, producer) {
  const key = cacheKey(cacheSource, params);
  const entry = await cache.lookup(key).catch(() => undefined);
  if (entry?.fresh) return /** @type {T} */ (entry.value);
  const value = await producer();
  await cache.set(key, cacheSource, value, ttlSec).catch(() => {});
  return value;
}
