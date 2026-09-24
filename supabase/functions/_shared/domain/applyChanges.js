import { clearResolvedConflicts } from './conflicts.js';
import { recomputeTravel } from './dayEdits.js';
import { isPersonal, startOf } from './stepTiming.js';

/**
 * Applique un réajustement accepté (panneau "Planning réajusté") :
 * journée recalculée, étapes reportées (ou supprimées, selon le choix de
 * l'utilisateur), réserve de lieux mise à jour (un lieu remplacé ou
 * supprimé y retourne, un lieu choisi en sort). Commun à replanDay,
 * reevaluatePlanning et au changement d'hébergement.
 * @param {import('./model.js').Trip} trip
 * @param {{ dayIndex: number, day: object, changes: object[], days?: Record<number, object> }} proposal
 *   days : autres journées déjà recalculées (changement d'hébergement)
 * @param {Record<string, 'postponed' | 'removed'>} [choices] choix pour chaque étape reportée ou supprimée
 * @returns {import('./model.js').Trip}
 */
export function applyChanges(trip, proposal, choices = {}, rules) {
  const days = trip.days.map((d, i) => proposal.days?.[i] ?? (i === proposal.dayIndex ? proposal.day : d));
  const touched = new Set([...(Number.isInteger(proposal.dayIndex) ? [proposal.dayIndex] : []), ...Object.keys(proposal.days ?? {}).map(Number)]);
  const out = new Set();
  const back = [];

  for (const c of proposal.changes) {
    if (c.kind === 'replaced') {
      out.add(c.toPlace.id);
      back.push(c.fromPlace);
      continue;
    }
    if (c.kind !== 'postponed' && c.kind !== 'removed') continue;
    const choice = c.target ? (choices[c.stepId] ?? c.kind) : 'removed';
    if (choice === 'removed') {
      if (c.step.place && !isPersonal(c.step)) back.push(c.step.place);
      continue;
    }
    const { dayIndex, start, end, freeStepId, afterStepId } = c.target;
    const moved = { ...c.step, start, end, status: 'planned', customTime: false, badges: (c.step.badges ?? []).filter((b) => b !== 'free_time') };
    delete moved.conflicts;
    const target = days[dayIndex];
    let steps;
    if (freeStepId) steps = target.steps.map((s) => (s.id === freeStepId ? { ...moved, type: s.type } : s));
    else {
      const later = target.steps.findIndex((s) => startOf(s) > startOf(moved));
      const index = afterStepId ? target.steps.findIndex((s) => s.id === afterStepId) + 1 : later === -1 ? target.steps.length : later;
      steps = [...target.steps.slice(0, index), moved, ...target.steps.slice(index)];
    }
    days[dayIndex] = { ...target, steps };
    touched.add(dayIndex);
  }

  for (const i of touched) days[i] = clearResolvedConflicts(recomputeTravel(days[i], trip, rules), trip.mode, rules);

  const used = new Set(days.flatMap((d) => d.steps.filter((s) => s.place).map((s) => s.place.id)));
  const seen = new Set();
  const candidates = [...trip.candidates.filter((p) => !out.has(p.id)), ...back].filter((p) => {
    if (used.has(p.id) || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  return { ...trip, days, candidates: candidates.slice(0, rules.places.maxCandidates) };
}
