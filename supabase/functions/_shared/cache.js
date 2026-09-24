import { cacheKey } from './cacheKey.js';
import { log } from './log.js';
import { getAdminClient } from './supabaseAdmin.js';

/**
 * Cache partagé entre tous les utilisateurs (table api_cache). Une panne du
 * cache n'empêche jamais de répondre : elle est journalisée et ignorée.
 */

/**
 * Lit une entrée, même expirée (les entrées expirées sont purgées chaque nuit).
 * @param {string} key
 * @returns {Promise<{ value: unknown, fresh: boolean } | undefined>}
 */
export async function cacheLookup(key) {
  const { data, error } = await getAdminClient()
    .from('api_cache')
    .select('value, expires_at')
    .eq('key', key)
    .maybeSingle();
  if (error) {
    log('warn', 'cache_read_failed', { code: error.code });
    return undefined;
  }
  if (!data) return undefined;
  return { value: data.value, fresh: Date.parse(data.expires_at) > Date.now() };
}

/**
 * @param {string} key
 * @returns {Promise<unknown | undefined>} undefined si absente ou expirée
 */
export async function cacheGet(key) {
  const entry = await cacheLookup(key);
  return entry?.fresh ? entry.value : undefined;
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
