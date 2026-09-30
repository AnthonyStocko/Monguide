/**
 * Format de réponse de l'IA de relecture (docs/ai-review.md) : schéma JSON
 * strict, construit pour CHAQUE séjour, qui n'accepte que les alias du
 * résumé envoyé (buildReviewRequest) :
 *
 *   { "operations": [
 *       { "op": "swap",    "stepA": alias, "stepB": alias, "reason": texte },
 *       { "op": "replace", "step": alias, "candidate": alias, "reason": texte },
 *       { "op": "shift",   "step": alias, "newStart": "HH:mm", "reason": texte }
 *     ],
 *     "dayTitles": { "YYYY-MM-DD": texte },
 *     "summary": texte }
 *
 * Forme compatible avec le mode strict des fournisseurs : chaque objet a
 * additionalProperties false et toutes ses propriétés requises ; les trois
 * opérations sont des variantes (anyOf). Le schéma ne vérifie que la forme :
 * le sens (étapes différentes, horaires faisables, lieu ouvert…) est
 * contrôlé ensuite par le code, opération par opération.
 */

/** Opérations possibles. */
export const REVIEW_OPS = Object.freeze(['swap', 'replace', 'shift']);

/** Longueurs maximales des textes de la réponse. */
export const REVIEW_TEXT_MAX = Object.freeze({ reason: 120, dayTitle: 40, summary: 280 });

const HHMM = '^([01][0-9]|2[0-3]):[0-5][0-9]$';
const text = (maxLength) => ({ type: 'string', minLength: 1, maxLength });

const variant = (op, properties) => ({
  type: 'object',
  additionalProperties: false,
  required: ['op', ...Object.keys(properties), 'reason'],
  properties: { op: { type: 'string', enum: [op] }, ...properties, reason: text(REVIEW_TEXT_MAX.reason) }
});

/**
 * @param {{ editableSteps: string[], candidateAliases: string[], dates: string[] }} request
 *   résultat de buildReviewRequest : alias des étapes modifiables et des candidats, dates du séjour
 * @returns {object | null} schéma JSON ; null si aucune étape n'est modifiable (inutile d'appeler l'IA)
 */
export function buildReviewSchema({ editableSteps, candidateAliases, dates }, rules) {
  if (!editableSteps.length) return null;
  const step = { type: 'string', enum: [...editableSteps] };
  const variants = [variant('swap', { stepA: step, stepB: step }), variant('shift', { step, newStart: { type: 'string', pattern: HHMM } })];
  // Sans candidat, pas de remplacement possible (une liste enum vide est refusée par les fournisseurs).
  if (candidateAliases.length) variants.splice(1, 0, variant('replace', { step, candidate: { type: 'string', enum: [...candidateAliases] } }));

  return {
    type: 'object',
    additionalProperties: false,
    required: ['operations', 'dayTitles', 'summary'],
    properties: {
      operations: { type: 'array', maxItems: rules.ai.maxOpsPerTrip, items: { anyOf: variants } },
      dayTitles: {
        type: 'object',
        additionalProperties: false,
        required: [...dates],
        properties: Object.fromEntries(dates.map((d) => [d, text(REVIEW_TEXT_MAX.dayTitle)]))
      },
      summary: text(REVIEW_TEXT_MAX.summary)
    }
  };
}
