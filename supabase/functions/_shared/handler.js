import { loadAppConfig } from './appConfig.js';
import { getCaller } from './auth.js';
import { assertMinAppVersion, readClientVersions } from './clientVersion.js';
import { corsHeaders, preflightResponse } from './cors.js';
import { AppError } from './errors.js';
import { log } from './log.js';
import { enforceRateLimit } from './rateLimit.js';
import { errorResponse, jsonResponse } from './respond.js';

/**
 * Point d'entrée commun des Edge Functions. Pour chaque requête : CORS,
 * méthode, jeton, versions (contrat et application), limite de requêtes,
 * puis handle(). Réponses JSON ; erreurs { error: { code, message } } ;
 * une ligne de journal par requête, sans donnée personnelle.
 *
 * @param {{
 *   name: string,
 *   methods?: string[],
 *   rateLimitKind?: 'generate' | 'default',
 *   handle: (ctx: { req: Request, caller: object, appConfig: { minAppVersion: string, rules: object } }) => Promise<unknown> | unknown
 * }} options
 */
export function serveFunction({ name, methods = ['POST'], rateLimitKind = 'default', handle }) {
  Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return preflightResponse(req);

    const started = Date.now();
    const cors = corsHeaders(req);
    let caller;
    let response;
    try {
      if (!methods.includes(req.method)) {
        throw new AppError(405, 'method_not_allowed', `Use ${methods.join(' or ')}`, { Allow: methods.join(', ') });
      }
      caller = getCaller(req);
      const { appVersion } = readClientVersions(req.headers);
      const appConfig = await loadAppConfig();
      assertMinAppVersion(appVersion, appConfig.minAppVersion);
      await enforceRateLimit({ req, caller, kind: rateLimitKind, rules: appConfig.rules });

      response = jsonResponse(await handle({ req, caller, appConfig }), { headers: cors });
    } catch (err) {
      if (!(err instanceof AppError)) log('error', 'unhandled_error', { fn: name, message: String(err?.message ?? err) });
      response = errorResponse(err, cors);
    }

    log(response.status >= 500 ? 'error' : 'info', 'request', {
      fn: name,
      method: req.method,
      status: response.status,
      caller: caller?.type ?? 'unknown',
      durationMs: Date.now() - started
    });
    return response;
  });
}
