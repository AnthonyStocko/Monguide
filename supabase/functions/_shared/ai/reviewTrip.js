import { applyReview } from '../domain/applyReview.js';
import { buildReviewRequest } from '../domain/buildReviewRequest.js';
import { buildReviewSchema } from '../domain/reviewSchema.js';
import { log } from '../log.js';
import { complete } from './complete.js';
import { loadPrompt, PROMPT_VERSIONS } from './prompts/index.js';

/**
 * Relecture d'un séjour qui vient d'être généré (fonction generate
 * seulement : jamais lors d'un recalcul de journée). Enchaînement :
 * buildReviewRequest -> complete (8 s au plus, quota compté avant l'appel)
 * -> applyReview. Tout échec (délai, quota, JSON invalide, erreur) donne
 * trip.review.status = "skipped" avec la raison : le planning généré est
 * livré tel quel, sans erreur. Jamais d'exception.
 *
 * Relecture tentée seulement si : consentement de l'utilisateur, ai.enabled,
 * fournisseur autre que "off", au moins une étape modifiable. Sinon,
 * review.status = "skipped" (raison "no_consent", "disabled" ou
 * "nothing_to_review") et aucun événement de progression.
 *
 * @param {import('../domain/model.js').Trip} trip séjour généré
 * @param {{
 *   rules: any, language: string, consent: boolean, wishes?: string,
 *   client: () => Promise<string>,
 *   usageStore: import('./types.js').AiUsageStore,
 *   onStart?: () => void,
 *   onDone?: (status: string) => void,
 *   completeFn?: typeof complete,
 *   now?: () => string
 * }} ctx client : identifiant du client pour les quotas, calculé seulement si la relecture est tentée ;
 *   onStart / onDone : événements de progression "review" et "review_done"
 * @returns {Promise<import('../domain/model.js').Trip>}
 */
export async function reviewTrip(trip, { rules, language, consent, wishes, client, usageStore, onStart = () => {}, onDone = () => {}, completeFn = complete, now = () => new Date().toISOString() }) {
  const skip = (reason) => ({ ...trip, review: { status: 'skipped', reason, provider: null, model: null, appliedOps: [], rejectedOps: [], dayTitles: {}, summary: null, originalDays: null, reviewedAt: now() } });
  if (!consent) return skip('no_consent');
  if (!rules.ai.enabled || rules.ai.provider === 'off') return skip('disabled');

  let request;
  let schema;
  try {
    request = buildReviewRequest(trip, { language, wishes }, rules);
    schema = buildReviewSchema(request, rules);
  } catch (err) {
    log('error', 'ai_review', { status: 'skipped', reason: 'request_failed', message: String(err?.message ?? err) });
    return skip('error');
  }
  if (!schema) return skip('nothing_to_review');

  onStart();
  let reviewed;
  try {
    const system = await loadPrompt('review', { maxOps: rules.ai.maxOpsPerTrip });
    const response = await completeFn(
      { system, user: request.text, jsonSchema: schema, timeoutMs: rules.ai.timeoutMs, language },
      { rules, client: await client(), usageStore }
    );
    reviewed = applyReview(trip, { ...response, ids: request.ids }, rules, { now: now() });
  } catch (err) {
    log('error', 'ai_review', { status: 'skipped', reason: 'exception', message: String(err?.message ?? err) });
    reviewed = skip('error');
  }
  const r = reviewed.review;
  log('info', 'ai_review', {
    status: r.status,
    ...(r.reason ? { reason: r.reason } : {}),
    provider: r.provider,
    model: r.model,
    applied: r.appliedOps.map((o) => o.op),
    rejected: r.rejectedOps.map((o) => o.rejection),
    promptVersion: `review.${PROMPT_VERSIONS.review}`,
    requestChars: request.stats.chars
  });
  onDone(r.status);
  return reviewed;
}
