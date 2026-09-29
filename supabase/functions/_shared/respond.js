import { AppError } from './errors.js';
import { log } from './log.js';

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

/**
 * Réponse en flux NDJSON (un objet JSON par ligne, docs/api.md) : run(send)
 * envoie les événements au fil de l'eau ; son résultat part en dernier sous
 * { event: "result", ... }. Une erreur après le début du flux devient
 * { event: "error", error: { code, message } } (le statut HTTP est déjà 200).
 * @param {(send: (event: object) => void) => Promise<object>} run
 * @param {Record<string, string>} [headers]
 */
export function ndjsonResponse(run, headers = {}) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send({ event: 'result', ...(await run(send)) });
      } catch (err) {
        if (!(err instanceof AppError)) log('error', 'stream_error', { message: String(err?.message ?? err) });
        const e = err instanceof AppError ? err : new AppError(500, 'internal_error', 'Internal error');
        send({ event: 'error', error: { code: e.code, message: e.message } });
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no', ...headers }
  });
}
