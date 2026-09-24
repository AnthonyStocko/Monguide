import { toMinutes } from './time.js';
import { durationOf, endOf, isFixed, legMinutes, minimumFor, startOf, stepName, withTimes } from './stepTiming.js';

/**
 * Étapes APRÈS une étape (insérée, ou validée lors du suivi) : décalées au
 * plus tôt après sa fin + trajet, dans l'ordre, sans jamais chevaucher un
 * point fixe (l'étape est alors raccourcie jusqu'à son minimum). Une étape
 * qui commencerait après rules.schedule.lastStepLatestStart, ou qui ne
 * tient plus avant le point fixe suivant, est déclarée infaisable (voir
 * resolveInfeasible). Une étape n'est jamais avancée.
 * @param {object[]} steps étapes de la journée, dans l'ordre
 * @param {number} index position de l'étape de départ du décalage
 * @param {{ mode: string }} ctx
 * @param {object} [options]
 * @param {(s: object) => boolean} [options.fixed] points fixes (par défaut isFixed)
 * @param {{ end: number, step: object }} [options.cursor] point de départ explicite (suivi : heure actuelle et lieu validé)
 * @param {Set<string>} [options.ignore] étapes déjà déclarées infaisables
 * @returns {{ steps: object[], changes: object[], infeasible: { stepId: string, reasons: string[] }[] }}
 */
export function shiftFollowing(steps, index, { mode }, rules, { fixed = isFixed, cursor, ignore = new Set() } = {}) {
  const out = [...steps];
  const changes = [];
  const infeasible = [];
  const latest = toMinutes(rules.schedule.lastStepLatestStart);
  let prev = cursor ? { end: cursor.end, step: cursor.step } : { end: endOf(out[index]), step: out[index] };
  const skipped = new Set(ignore);

  for (let j = index + 1; j < out.length; j += 1) {
    const s = out[j];
    if (skipped.has(s.id)) continue;
    if (fixed(s)) {
      prev = { end: endOf(s), step: s };
      continue;
    }
    const start = Math.max(startOf(s), prev.end + legMinutes(prev.step, s, mode, rules));
    let end = start + durationOf(s);
    // Borne : le prochain point fixe (les étapes intermédiaires seront placées ou écartées ensuite).
    const nextFixed = out.find((n, k) => k > j && !skipped.has(n.id) && fixed(n));
    if (nextFixed) end = Math.min(end, startOf(nextFixed) - legMinutes(s, nextFixed, mode, rules));

    if (start === startOf(s) && end === endOf(s)) {
      prev = { end, step: s };
      continue;
    }
    const reasons = [];
    if (start > latest) reasons.push('LATE_START');
    if (end - start < minimumFor(s, rules)) reasons.push('TOO_SHORT');
    if (reasons.length) {
      infeasible.push({ stepId: s.id, reasons });
      skipped.add(s.id);
      continue;
    }
    out[j] = withTimes(s, start, end);
    changes.push({
      kind: start !== startOf(s) ? 'shifted' : 'shortened',
      stepId: s.id,
      name: stepName(s),
      from: { start: s.start, end: s.end },
      to: { start: out[j].start, end: out[j].end },
      customTime: Boolean(s.customTime)
    });
    prev = { end, step: out[j] };
  }
  return { steps: out, changes, infeasible };
}
