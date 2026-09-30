/**
 * Compteurs anonymes de la relecture (table ai_review_stats, migration
 * 20260930120000_ai_review_stats.sql) : aucun contenu, aucun identifiant de
 * client. Voir docs/ai-review.md (Bloc G).
 */

/** Tranches de durée d'une relecture tentée (médiane estimée par tranche). */
export const DURATION_BUCKETS = Object.freeze([
  [2000, '0-2s'],
  [4000, '2-4s'],
  [6000, '4-6s'],
  [8000, '6-8s'],
  [Infinity, '8s+']
]);

/** @param {number} ms */
export function durationBucket(ms) {
  return DURATION_BUCKETS.find(([max]) => ms < max)[1];
}

/** Morceau de nom de métrique sûr (lettres, chiffres, . _ / : -), 80 caractères au plus. */
const safe = (text) => String(text ?? 'none').replace(/[^A-Za-z0-9_./:-]/g, '_').slice(0, 80);

/**
 * Métriques d'une relecture : { "métrique": quantité }.
 * @param {import('../domain/model.js').TripReview} review
 * @param {{ attempted: boolean, durationMs?: number }} info
 * @returns {Record<string, number>}
 */
export function reviewMetrics(review, { attempted, durationMs }) {
  const out = {};
  const add = (key, n = 1) => {
    if (n > 0) out[key] = (out[key] ?? 0) + n;
  };
  if (!attempted) {
    add('review:not_attempted');
    add(`not_attempted:${safe(review.reason)}`);
    return out;
  }
  add(`review:${safe(review.status)}`);
  if (review.status === 'skipped') add(`skipped:${safe(review.reason)}`);
  if (typeof durationMs === 'number') add(`duration:${durationBucket(durationMs)}`);
  if (review.provider) add(`model:${safe(review.provider)}/${safe(review.model)}`);
  add('ops:applied', review.appliedOps.length);
  add('ops:rejected', review.rejectedOps.length);
  for (const r of review.rejectedOps) add(`rejected:${safe(r.rejection)}`);
  return out;
}

/** Événements de l'application comptés par la fonction ai-feedback. */
export const FEEDBACK_EVENTS = Object.freeze({ revert_original: 'revert:original', revert_reviewed: 'revert:reviewed' });
