import { RULES } from './domain/config/rules.js';
import { ExternalError } from './errors.js';
import { log } from './log.js';
import { userAgent } from './meta.js';

/**
 * SEUL module du serveur qui appelle des API externes. Par défaut (rules.js,
 * rubrique http) : délai de 10 s, 2 tentatives, User-Agent Mon guide. Une
 * nouvelle tentative n'a lieu qu'après une erreur réseau, un délai dépassé
 * ou une réponse 5xx ; jamais après un 429 ni un autre 4xx. Une phase peut
 * passer d'autres valeurs pour une API donnée.
 *
 * L'URL n'est jamais journalisée (elle peut contenir des coordonnées) : seul
 * l'hôte l'est.
 *
 * @param {string | URL} url
 * @param {RequestInit & { source: string, timeoutMs?: number, maxAttempts?: number, retryDelayMs?: number }} options
 * @returns {Promise<Response>} réponse 2xx
 * @throws {ExternalError}
 */
export async function fetchExternal(url, options) {
  const {
    source,
    timeoutMs = RULES.http.timeoutMs,
    maxAttempts = RULES.http.maxAttempts,
    retryDelayMs = RULES.http.retryDelayMs,
    headers,
    ...init
  } = options;
  const host = new URL(url).host;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now();
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'User-Agent': userAgent(), ...headers },
        signal: AbortSignal.timeout(timeoutMs)
      });
      log(res.ok ? 'info' : 'warn', 'external_call', {
        source,
        host,
        attempt,
        status: res.status,
        durationMs: Date.now() - started
      });
      if (res.ok) return res;
      await res.body?.cancel();
      lastError = new ExternalError(source, res.status, res.status >= 500);
    } catch (err) {
      log('warn', 'external_call', {
        source,
        host,
        attempt,
        failure: err?.name === 'TimeoutError' ? 'timeout' : 'network',
        durationMs: Date.now() - started
      });
      lastError = new ExternalError(source, null, true);
    }
    if (!lastError.retryable) break;
    if (attempt < maxAttempts) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }
  throw lastError;
}

/**
 * fetchExternal + lecture du corps JSON.
 * @param {string | URL} url
 * @param {Parameters<typeof fetchExternal>[1]} options
 */
export async function fetchExternalJson(url, options) {
  const res = await fetchExternal(url, { ...options, headers: { Accept: 'application/json', ...options.headers } });
  try {
    return await res.json();
  } catch {
    throw new ExternalError(options.source, res.status, false);
  }
}
