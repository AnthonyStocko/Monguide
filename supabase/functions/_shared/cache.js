import { cacheKey } from './cacheKey.js';
import { log } from './log.js';
import { getAdminClient } from './supabaseAdmin.js';

/**
 * Cache partagé entre tous les utilisateurs (table api_cache). Une panne du
 * cache n'empêche jamais de répondre : elle est journalisée et ignorée.
 */

/**
 * @param {string} key
 * @returns {Promise<unknown | undefined>} undefined si absente ou expirée
 */
export async function cacheGet(key) {
  const { data, error } = await getAdminClient()
    .from('api_cache')
    .select('value')
    .eq('key', key)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error) {
    log('warn', 'cache_read_failed', { code: error.code });
    return undefined;
  }
  return data ? data.value : undefined;
}

/**
 * @param {string} key
 * @param {string} source
 * @param {unknown} value sérialisable en JSON
 * @param {number} ttlSec
 */
export async function cacheSet(key, source, value, ttlSec) {
  const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();
  const { error } = await getAdminClient()
    .from('api_cache')
    .upsert({ key, source, value, expires_at: expiresAt });
  if (error) log('warn', 'cache_write_failed', { code: error.code, source });
}

/**
 * Renvoie la valeur en cache, ou la calcule avec producer() et la met en cache.
 * @template T
 * @param {string} source
 * @param {Record<string, unknown>} params paramètres de la clé (voir cacheKey)
 * @param {number} ttlSec
 * @param {() => Promise<T>} producer
 * @returns {Promise<T>}
 */
export async function cached(source, params, ttlSec, producer) {
  const key = cacheKey(source, params);
  const hit = await cacheGet(key);
  if (hit !== undefined) return /** @type {T} */ (hit);
  const value = await producer();
  await cacheSet(key, source, value, ttlSec);
  return value;
}
