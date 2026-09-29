import { endOf, isFixed, minimumFor, startOf, stepName } from './stepTiming.js';

/**
 * Étape personnelle qui couvre un repas (ex. "Repas chez des amis") : la
 * pause déjeuner ou le dîner est proposé à la suppression plutôt que
 * décalé (raison LUNCH_COVERED ou DINNER_COVERED). "Couvre" : le
 * chevauchement est au moins égal à la durée minimale du repas (on ne
 * pourrait plus le raccourcir avant).
 * @param {object[]} steps étapes de la journée, étape personnelle comprise
 * @param {number} index position de l'étape personnelle
 * @returns {{ steps: object[], index: number, changes: object[] }}
 */
export function handleLunchOverlap(steps, index, _ctx, rules) {
  const personal = steps[index];
  const covered = (s) =>
    (s.type === 'lunch' || s.type === 'dinner') &&
    !isFixed(s) &&
    Math.min(endOf(s), endOf(personal)) - Math.max(startOf(s), startOf(personal)) >= minimumFor(s, rules);
  const removed = steps.filter((s, i) => i !== index && covered(s));
  if (!removed.length) return { steps, index, changes: [] };
  const kept = steps.filter((s) => !removed.includes(s));
  return {
    steps: kept,
    index: kept.indexOf(personal),
    changes: removed.map((s) => ({ kind: 'removed', stepId: s.id, name: stepName(s), reason: s.type === 'dinner' ? 'DINNER_COVERED' : 'LUNCH_COVERED', from: { start: s.start, end: s.end }, step: s, target: null }))
  };
}
