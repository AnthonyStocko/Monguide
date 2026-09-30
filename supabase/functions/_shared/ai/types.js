/**
 * Couche d'accès aux modèles d'IA (côté serveur uniquement), interface
 * commune à tous les fournisseurs. Voir docs/ai-review.md.
 *
 * complete(request) -> AiSuccess | AiFailure : une seule requête, jamais de
 * nouvelle tentative ; tout échec est une valeur (jamais d'exception), le
 * planning étant alors livré sans relecture.
 */

/**
 * Raisons d'échec : délai dépassé, quota (le nôtre ou celui du fournisseur),
 * réponse non JSON ou non conforme au schéma, autre erreur (clé absente ou
 * refusée, fournisseur inconnu, panne), relecture désactivée (ai.enabled
 * false ou fournisseur "off").
 */
export const AI_FAILURES = Object.freeze(['timeout', 'quota', 'invalid_json', 'error', 'disabled']);

/**
 * @typedef {object} AiRequest
 * @property {string} system consignes (aucune donnée personnelle)
 * @property {string} user données à relire, déjà anonymisées
 * @property {object} jsonSchema schéma JSON de la réponse attendue (sous-ensemble : voir jsonSchema.js)
 * @property {number} [timeoutMs] délai, borné par rules.ai.timeoutMs
 * @property {string} [language] langue des textes lisibles de la réponse ("fr", "en")
 */

/**
 * @typedef {object} AiSuccess
 * @property {true} ok
 * @property {unknown} json réponse conforme au schéma
 * @property {{ input: number, output: number }} usage jetons consommés (0 si inconnus)
 * @property {string} provider
 * @property {string} model
 * @property {number} durationMs
 */

/**
 * @typedef {object} AiFailure
 * @property {false} ok
 * @property {'timeout' | 'quota' | 'invalid_json' | 'error' | 'disabled'} reason
 */

/**
 * @typedef {object} AiProvider Adaptateur d'un fournisseur.
 * @property {string} name identifiant (valeur de rules.ai.provider)
 * @property {string} defaultModel modèle utilisé quand rules.ai.model est vide
 * @property {string | null} secretName secret Supabase de la clé d'API (null : aucune clé)
 * @property {(call: { apiKey: string, model: string, system: string, user: string, jsonSchema: object, timeoutMs: number }) => Promise<{ text: string | null, usage: { input: number, output: number } }>} request
 *   une requête HTTP ; lève ExternalError (http.js) en cas d'échec
 */

/**
 * @typedef {object} AiUsageStore Compteurs de ai_usage (quotas quotidiens).
 * @property {(p: { day: string, client: string, userLimit: number, globalLimit: number }) => Promise<boolean>} reserve
 *   compte un appel s'il reste du quota (client et global), sinon false ; atomique
 * @property {(p: { day: string, client: string, tokens: number }) => Promise<void>} addTokens
 */
