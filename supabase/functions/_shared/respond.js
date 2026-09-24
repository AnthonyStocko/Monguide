import { AppError } from './errors.js';

/**
 * @param {unknown} body
 * @param {{ status?: number, headers?: Record<string, string> }} [options]
 */
export function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
  });
}

/**
 * Réponse d'erreur { error: { code, message } } ; toute erreur inattendue
 * devient un 500 sans détail.
 * @param {unknown} err
 * @param {Record<string, string>} [headers]
 */
export function errorResponse(err, headers = {}) {
  const e = err instanceof AppError ? err : new AppError(500, 'internal_error', 'Internal error');
  return jsonResponse(
    { error: { code: e.code, message: e.message } },
    { status: e.status, headers: { ...headers, ...e.headers } }
  );
}
