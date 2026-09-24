import { endOf, isFixed, legMinutes, startOf } from './stepTiming.js';

/**
 * Deux étapes se chevauchent-elles, trajet de l'une à l'autre compris ?
 * @returns {boolean}
 */
export function stepsConflict(a, b, mode, rules) {
  if (startOf(b) >= endOf(a)) return endOf(a) + legMinutes(a, b, mode, rules) > startOf(b);
  if (startOf(a) >= endOf(b)) return endOf(b) + legMinutes(b, a, mode, rules) > startOf(a);
  return true;
}

/**
 * Insère une étape (personnelle) à son horaire, dans l'ordre chronologique.
 * Les points fixes (étapes verrouillées, horaires personnalisés, étapes
 * terminées ou passées) ne bougent jamais : si la nouvelle étape en
 * chevauche un (trajet compris), rien n'est inséré et l'erreur
 * OVERLAP_FIXED indique l'étape en cause. INVALID : fin avant ou égale au début.
 * @param {object[]} steps étapes de la journée, dans l'ordre
 * @param {object} step étape à insérer
 * @param {{ mode: string }} ctx
 * @returns {{ steps: object[], index: number } | { error: { code: 'INVALID' | 'OVERLAP_FIXED', stepId?: string } }}
 */
export function insertStep(steps, step, { mode }, rules) {
  if (endOf(step) <= startOf(step)) return { error: { code: 'INVALID' } };
  const fixed = steps.find((s) => s.id !== step.id && isFixed(s) && stepsConflict(s, step, mode, rules));
  if (fixed) return { error: { code: 'OVERLAP_FIXED', stepId: fixed.id } };
  const others = steps.filter((s) => s.id !== step.id);
  let index = others.findIndex((s) => startOf(s) >= startOf(step));
  if (index === -1) index = others.length;
  return { steps: [...others.slice(0, index), step, ...others.slice(index)], index };
}
