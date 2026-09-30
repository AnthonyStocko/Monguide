import { log } from '../log.js';
import { parseJsonResponse } from './jsonSchema.js';
import { AI_PROVIDERS } from './providers/index.js';

/**
 * Appel d'un modèle d'IA (interface commune, voir types.js), dans cet ordre :
 *  1. relecture désactivée (rules.ai.enabled false, fournisseur "off") : "disabled" ;
 *  2. fournisseur inconnu ou clé d'API absente : "error", aucun appel ;
 *  3. quota du jour (client, puis global) compté AVANT d'appeler le
 *     fournisseur ; épuisé : "quota" ; compteurs illisibles : "error" (on
 *     n'appelle pas un service payant sans pouvoir compter) ;
 *  4. une seule requête, délai rules.ai.timeoutMs au plus : "timeout" ;
 *     429 du fournisseur : "quota" ; autre refus (clé invalide…) : "error" ;
 *  5. réponse non JSON ou non conforme au schéma : "invalid_json".
 * Jamais d'exception : tout échec est une valeur, le planning étant alors
 * livré sans relecture.
 *
 * Journal "ai_call" : fournisseur, modèle, durée, jetons, résultat. JAMAIS
 * le contenu envoyé ni reçu, ni la clé d'API.
 *
 * @param {import('./types.js').AiRequest} request
 * @param {{
 *   rules: any,
 *   client: string,
 *   usageStore: import('./types.js').AiUsageStore,
 *   getSecret?: (name: string) => string | undefined,
 *   providers?: Record<string, import('./types.js').AiProvider>,
 *   now?: () => number
 * }} ctx client : identifiant du client (rateLimit.clientId : utilisateur, sinon empreinte salée de l'IP)
 * @returns {Promise<import('./types.js').AiSuccess | import('./types.js').AiFailure>}
 */
export async function complete({ system, user, jsonSchema, timeoutMs, language }, { rules, client, usageStore, getSecret = denoSecret, providers = AI_PROVIDERS, now = Date.now }) {
  const cfg = rules.ai;
  const provider = providers[cfg.provider];
  const model = cfg.model || provider?.defaultModel || '';
  const started = now();
  const fail = (reason, detail) => {
    log(reason === 'disabled' ? 'info' : 'warn', 'ai_call', { provider: cfg.provider, model, durationMs: now() - started, result: reason, ...(detail ? { detail } : {}) });
    return { ok: false, reason };
  };

  if (!cfg.enabled || cfg.provider === 'off') return fail('disabled');
  if (!provider) return fail('error', 'unknown_provider');
  const apiKey = provider.secretName ? getSecret(provider.secretName) : undefined;
  if (!apiKey) return fail('error', 'no_key');

  const day = new Date(now()).toISOString().slice(0, 10);
  try {
    const allowed = await usageStore.reserve({ day, client, userLimit: cfg.userDailyLimit, globalLimit: cfg.globalDailyLimit });
    if (!allowed) return fail('quota', 'daily_limit');
  } catch {
    return fail('error', 'usage_unavailable');
  }

  let answer;
  try {
    answer = await provider.request({
      apiKey,
      model,
      system: language ? `${system}\n\nLanguage of every human-readable text in the JSON: ${language}.` : system,
      user,
      jsonSchema,
      timeoutMs: Math.min(timeoutMs ?? cfg.timeoutMs, cfg.timeoutMs)
    });
  } catch (err) {
    if (err?.failure === 'timeout') return fail('timeout');
    if (err?.upstreamStatus === 429) return fail('quota', 'provider_429');
    return fail('error', err?.upstreamStatus ? `http_${err.upstreamStatus}` : (err?.failure ?? 'exception'));
  }

  const tokens = answer.usage.input + answer.usage.output;
  if (tokens > 0) await usageStore.addTokens({ day, client, tokens }).catch(() => {});
  const parsed = parseJsonResponse(answer.text, jsonSchema);
  const durationMs = now() - started;
  if (!parsed.ok) {
    log('warn', 'ai_call', { provider: provider.name, model, durationMs, usage: answer.usage, result: 'invalid_json', schemaErrors: parsed.errors.length });
    return { ok: false, reason: 'invalid_json' };
  }
  log('info', 'ai_call', { provider: provider.name, model, durationMs, usage: answer.usage, result: 'ok' });
  return { ok: true, json: parsed.json, usage: answer.usage, provider: provider.name, model, durationMs };
}

/** Secrets de la fonction (Supabase : Deno.env) ; ailleurs (tests, script d'essai) : aucun. */
function denoSecret(name) {
  return globalThis.Deno?.env.get(name);
}
