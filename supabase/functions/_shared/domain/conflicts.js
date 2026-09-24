import { stepsConflict } from './insertStep.js';
import { endOf, startOf } from './stepTiming.js';

/**
 * Marque les conflits d'horaire d'une journée (Step.conflicts : identifiants
 * des étapes en conflit), utilisé après "Ajouter sans réorganiser" et après
 * chaque modification pour effacer les conflits corrigés. Conflit : deux
 * étapes dont les horaires se chevauchent, ou deux étapes consécutives sans
 * le temps de trajet entre elles.
 * @returns {object} nouvelle journée
 */
export function markConflicts(day, mode, rules) {
  const conflicts = new Map(day.steps.map((s) => [s.id, new Set()]));
  const steps = day.steps;
  for (let i = 0; i < steps.length; i += 1) {
    for (let j = i + 1; j < steps.length; j += 1) {
      const [a, b] = [steps[i], steps[j]];
      const overlap = startOf(a) < endOf(b) && startOf(b) < endOf(a);
      if (overlap || (j === i + 1 && stepsConflict(a, b, mode, rules))) {
        conflicts.get(a.id).add(b.id);
        conflicts.get(b.id).add(a.id);
      }
    }
  }
  let changed = false;
  const next = steps.map((s) => {
    const ids = [...conflicts.get(s.id)];
    if (!ids.length && !s.conflicts) return s;
    changed = true;
    if (!ids.length) {
      const { conflicts: _drop, ...rest } = s;
      return rest;
    }
    return { ...s, conflicts: ids };
  });
  return changed ? { ...day, steps: next } : day;
}

/**
 * Efface les conflits corrigés sans en ajouter de nouveaux (après une
 * modification d'une journée qui en avait).
 * @returns {object} nouvelle journée
 */
export function clearResolvedConflicts(day, mode, rules) {
  if (!day.steps.some((s) => s.conflicts)) return day;
  const marked = markConflicts(day, mode, rules);
  return {
    ...marked,
    steps: marked.steps.map((s) => {
      const before = day.steps.find((b) => b.id === s.id);
      if (s.conflicts && !before?.conflicts) {
        const { conflicts: _drop, ...rest } = s;
        return rest;
      }
      return s;
    })
  };
}
