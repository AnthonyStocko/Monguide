import { endOf, isFixed, legMinutes, startOf } from './stepTiming.js';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Invariants d'une journée après un recalcul (tests, et vérification en
 * développement après chaque recalcul). Renvoie la liste des violations
 * (vide : tout va bien) :
 *  - FORMAT : une heure n'est pas au format "HH:mm" ;
 *  - END_BEFORE_START : une fin n'est pas postérieure à son début ;
 *  - OVERLAP : une étape chevauche la suivante, trajet compris ;
 *  - FIXED_MOVED / FIXED_REMOVED : un point fixe a changé d'horaire ou disparu ;
 *  - ORDER : l'ordre relatif des étapes conservées a changé ;
 *  - DUPLICATE_PLACE : un lieu apparaît deux fois dans le séjour.
 * @param {object} day journée recalculée
 * @param {{ before?: object, trip?: object, mode: string }} ctx
 *   before : journée avant le recalcul ; trip : séjour complet après le recalcul
 * @returns {string[]}
 */
export function checkDayInvariants(day, { before, trip, mode }, rules) {
  const violations = [];
  const steps = day.steps;
  for (const s of steps) {
    if (!HHMM.test(s.start ?? '') || !HHMM.test(s.end ?? '')) {
      violations.push(`FORMAT:${s.id}`);
      continue;
    }
    if (endOf(s) <= startOf(s)) violations.push(`END_BEFORE_START:${s.id}`);
  }
  if (day.departure && !HHMM.test(day.departure.time ?? '')) violations.push('FORMAT:departure');
  if (violations.length) return violations;

  for (let i = 0; i + 1 < steps.length; i += 1) {
    const [a, b] = [steps[i], steps[i + 1]];
    if (endOf(a) + legMinutes(a, b, mode, rules) > startOf(b)) violations.push(`OVERLAP:${a.id}->${b.id}`);
  }

  if (before) {
    const byId = new Map(steps.map((s) => [s.id, s]));
    for (const s of before.steps.filter(isFixed)) {
      const now = byId.get(s.id);
      if (!now) violations.push(`FIXED_REMOVED:${s.id}`);
      else if (now.start !== s.start || now.end !== s.end) violations.push(`FIXED_MOVED:${s.id}`);
    }
    const common = new Set(before.steps.map((s) => s.id));
    const order = steps.filter((s) => common.has(s.id)).map((s) => s.id);
    const expected = before.steps.filter((s) => byId.has(s.id)).map((s) => s.id);
    if (order.join() !== expected.join()) violations.push(`ORDER:${order.join(',')}`);
  }

  if (trip) {
    const seen = new Set();
    for (const d of trip.days) {
      for (const s of d.steps) {
        if (!s.place) continue;
        if (seen.has(s.place.id)) violations.push(`DUPLICATE_PLACE:${s.place.id}`);
        seen.add(s.place.id);
      }
    }
  }
  return violations;
}
