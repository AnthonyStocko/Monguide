import { endOf, isFixed, legMinutes, minimumFor, startOf, stepName, withTimes } from './stepTiming.js';

/**
 * Étapes AVANT l'étape insérée qui la chevauchent (trajet compris) :
 * raccourcies si la durée reste au moins égale au minimum de l'activité,
 * sinon déclarées infaisables (à reporter, remplacer ou supprimer par
 * resolveInfeasible). Les points fixes ne sont jamais modifiés.
 * @param {object[]} steps étapes de la journée, dans l'ordre
 * @param {number} index position de l'étape insérée
 * @param {{ mode: string }} ctx
 * @returns {{ steps: object[], changes: object[], infeasible: { stepId: string, reasons: string[] }[] }}
 */
export function shrinkPrevious(steps, index, { mode }, rules, { fixed = isFixed } = {}) {
  const out = [...steps];
  const changes = [];
  const infeasible = [];
  let next = out[index];
  for (let j = index - 1; j >= 0; j -= 1) {
    const s = out[j];
    if (fixed(s)) {
      next = s;
      continue;
    }
    const limit = startOf(next) - legMinutes(s, next, mode, rules);
    if (endOf(s) <= limit) {
      next = s;
      continue;
    }
    if (limit - startOf(s) >= minimumFor(s, rules)) {
      out[j] = withTimes(s, startOf(s), limit);
      changes.push({ kind: 'shortened', stepId: s.id, name: stepName(s), from: { start: s.start, end: s.end }, to: { start: out[j].start, end: out[j].end }, customTime: Boolean(s.customTime) });
      next = out[j];
    } else {
      // Trop court une fois raccourci : l'étape ne sert plus de borne aux précédentes.
      infeasible.push({ stepId: s.id, reasons: ['TOO_SHORT'] });
    }
  }
  return { steps: out, changes, infeasible };
}
