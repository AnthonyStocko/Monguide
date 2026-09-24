import { recomputeTravel } from './dayEdits.js';
import { handleLunchOverlap } from './handleLunchOverlap.js';
import { insertStep } from './insertStep.js';
import { usedPlaceIds } from './replaceStep.js';
import { resolveInfeasible } from './resolveInfeasible.js';
import { shiftFollowing } from './shiftFollowing.js';
import { shrinkPrevious } from './shrinkPrevious.js';
import { endOf, infeasibility, isFixed, startOf } from './stepTiming.js';
import { toMinutes } from './time.js';
import { clearResolvedConflicts, markConflicts } from './conflicts.js';

/** Nombre maximal de passes de stabilisation (chaque passe écarte au moins une étape). */
const MAX_PASSES = 20;

/**
 * Recalcul d'une journée à l'ajout ou à la modification d'une étape
 * personnelle (exécuté sur le téléphone, disponible hors ligne). Enchaîne :
 *  1. insertStep : insertion à l'horaire choisi ; chevauchement d'un point
 *     fixe = erreur, aucun recalcul ;
 *  2. handleLunchOverlap : déjeuner couvert proposé à la suppression ;
 *  3. shrinkPrevious : étapes d'avant raccourcies ;
 *  4. shiftFollowing : étapes d'après décalées ;
 *  5. faisabilité des étapes touchées (horaires d'ouverture, pluie, fin
 *     tardive, règle des 19h00) puis resolveInfeasible (raccourcir,
 *     remplacer, reporter, supprimer), jusqu'à stabilité.
 * Rien n'est appliqué : le résultat est présenté dans le panneau
 * "Planning réajusté" puis appliqué par applyChanges.
 *
 * @param {import('./model.js').Trip} trip
 * @param {number} dayIndex
 * @param {object} personal étape personnelle (nouvelle, ou modifiée : même identifiant)
 * @param {{ today?: string }} [options] today : date du jour à destination (report sur un jour postérieur)
 * @returns {{ error: { code: string, stepId?: string } } | { dayIndex: number, day: object, changes: object[], warnings: { code: string, [k: string]: any }[] }}
 */
export function replanDay(trip, dayIndex, personal, rules, { today } = {}) {
  const day = trip.days[dayIndex];
  const ctx = { trip, dayIndex, day, mode: trip.mode, countryCode: trip.destination.countryCode, today, used: usedPlaceIds(trip), claims: new Set() };

  const inserted = insertStep(day.steps, personal, ctx, rules);
  if (inserted.error) return { error: inserted.error };

  const lunch = handleLunchOverlap(inserted.steps, inserted.index, ctx, rules);
  const shrunk = shrinkPrevious(lunch.steps, lunch.index, ctx, rules);
  const changes = new Map();
  const record = (c) => {
    const previous = changes.get(c.stepId);
    // Même étape touchée plusieurs fois : horaire d'origine conservé, dernier état retenu.
    changes.set(c.stepId, previous?.from && c.from && c.kind !== 'replaced' ? { ...c, from: previous.from } : c);
  };
  lunch.changes.forEach(record);
  shrunk.changes.forEach(record);

  let steps = shrunk.steps;
  let pending = shrunk.infeasible;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const ignore = new Set(pending.map((p) => p.stepId));
    for (const item of [...pending].sort((a, b) => steps.findIndex((s) => s.id === a.stepId) - steps.findIndex((s) => s.id === b.stepId))) {
      ignore.delete(item.stepId);
      const resolved = resolveInfeasible(steps, item, { ...ctx, ignore }, rules);
      steps = resolved.steps;
      record(resolved.change);
    }
    const shifted = shiftFollowing(steps, 0, ctx, rules);
    steps = shifted.steps;
    shifted.changes.forEach(record);
    // Faisabilité des étapes touchées par ce décalage.
    const touched = shifted.changes
      .map((c) => steps.find((s) => s.id === c.stepId))
      .filter((s) => s && !isFixed(s))
      .map((s) => ({ stepId: s.id, reasons: infeasibility(s, startOf(s), endOf(s), ctx, rules) }))
      .filter((i) => i.reasons.length);
    pending = [...shifted.infeasible, ...touched];
    if (!pending.length) break;
  }
  // Sécurité : ce qui reste infaisable après les passes est supprimé.
  for (const item of pending) {
    const resolved = resolveInfeasible(steps, { ...item, reasons: item.reasons }, { ...ctx, trip: { ...trip, candidates: [], days: [] } }, rules);
    steps = resolved.steps;
    record(resolved.change);
  }

  // Changements sans effet (étape revenue à son horaire d'origine) retirés.
  const list = [...changes.values()].filter((c) => !(c.from && c.to && c.kind !== 'replaced' && c.from.start === c.to.start && c.from.end === c.to.end));
  const next = clearResolvedConflicts(recomputeTravel({ ...day, steps }, trip, rules), trip.mode, rules);
  return { dayIndex, day: next, changes: list, warnings: dayWarnings(next, personal, rules) };
}

/**
 * Avertissements d'une journée recalculée : TRAVEL_UNKNOWN (étape
 * personnelle sans lieu), LATE (retour ou fin après rules.schedule.lateEnd).
 */
export function dayWarnings(day, personal, rules) {
  const warnings = [];
  if (personal && !personal.place) warnings.push({ code: 'TRAVEL_UNKNOWN' });
  const last = day.steps[day.steps.length - 1];
  if (last) {
    const back = endOf(last) + (day.returnTravelMin ?? 0);
    if (back > toMinutes(rules.schedule.lateEnd)) warnings.push({ code: 'LATE', lateEnd: rules.schedule.lateEnd });
  }
  return warnings;
}

/**
 * "Ajouter sans réorganiser" : l'étape est ajoutée telle quelle ; les
 * étapes en conflit portent le badge "Conflit d'horaire" jusqu'à correction.
 * @returns {{ error: object } | { dayIndex: number, day: object, changes: [], warnings: object[] }}
 */
export function insertWithoutReplan(trip, dayIndex, personal, rules) {
  const day = trip.days[dayIndex];
  const inserted = insertStep(day.steps, personal, { mode: trip.mode }, rules);
  if (inserted.error) return { error: inserted.error };
  const next = markConflicts(recomputeTravel({ ...day, steps: inserted.steps }, trip, rules), trip.mode, rules);
  return { dayIndex, day: next, changes: [], warnings: dayWarnings(next, personal, rules) };
}

/**
 * Suppression d'une étape personnelle : trajets recalculés, conflits corrigés
 * effacés. Les autres étapes ne bougent pas.
 * @returns {{ dayIndex: number, day: object, changes: [], warnings: [] }}
 */
export function removePersonalStep(trip, dayIndex, stepId, rules) {
  const day = trip.days[dayIndex];
  const steps = day.steps.filter((s) => s.id !== stepId);
  return { dayIndex, day: clearResolvedConflicts(recomputeTravel({ ...day, steps }, trip, rules), trip.mode, rules), changes: [], warnings: [] };
}
