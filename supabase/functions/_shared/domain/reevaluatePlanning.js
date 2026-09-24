import { recomputeTravel } from './dayEdits.js';
import { usedPlaceIds } from './replaceStep.js';
import { findReplacement, resolveInfeasible } from './resolveInfeasible.js';
import { shiftFollowing } from './shiftFollowing.js';
import { durationOf, endOf, infeasibility, isFixedForTracking, legMinutes, startOf, stepName, withTimes } from './stepTiming.js';
import { toMinutes } from './time.js';
import { dayWarnings } from './replanDay.js';

/** Passes de stabilisation (chaque passe prend au moins une décision de plus). */
const MAX_PASSES = 10;

/**
 * Suivi des étapes en temps réel (jour en cours) : statut d'une étape
 * ("Valider cette étape", "Passer cette étape") puis réévaluation de la
 * suite de la journée. Fonctions pures ; rien n'est appliqué en silence :
 * les changements proposés sont présentés dans le panneau "Planning
 * réajusté" puis appliqués par applyChanges.
 */

/**
 * Enregistre le statut d'une étape (updatedAt est mis à jour par la sauvegarde).
 * @param {'planned' | 'done' | 'skipped'} status
 * @param {string} [completedAt] "HH:mm" à destination (étape terminée ou passée)
 * @returns {import('./model.js').Trip}
 */
export function setStepStatus(trip, dayIndex, stepId, status, completedAt) {
  const days = trip.days.map((d, i) => {
    if (i !== dayIndex) return d;
    return {
      ...d,
      steps: d.steps.map((s) => {
        if (s.id !== stepId) return s;
        const { completedAt: _old, ...rest } = s;
        return status === 'planned' ? { ...rest, status } : { ...rest, status, completedAt };
      })
    };
  });
  return { ...trip, days };
}

/**
 * Réévaluation après la validation (ou le passage) d'une étape :
 *  a) retard : si l'heure actuelle dépasse le début de l'étape suivante
 *     (trajet depuis le lieu validé compris), les étapes restantes sont
 *     décalées ; un horaire personnalisé peut l'être, en le signalant
 *     (changement customTime) ; une étape verrouillée ne bouge jamais ;
 *  b) une étape qui commencerait après rules.schedule.lastStepLatestStart
 *     est proposée au report ou à la suppression ; un déjeuner au
 *     restaurant décalé hors de ses horaires : autre restaurant ouvert,
 *     marché, sinon report ou suppression ;
 *  c) météo (en ligne seulement, day.weather à jour) : sur les heures
 *     restantes, lieu extérieur sous la pluie -> lieu intérieur de la
 *     réserve à au plus rules.travel.maxTravelMin ;
 *  d) trajets réestimés depuis le lieu validé : au-delà de
 *     rules.travel.maxTravelMin, un lieu plus proche est proposé.
 * Les décisions (b) sont appliquées à la journée d'origine et le décalage
 * recalculé, jusqu'à stabilité : une étape supprimée ne repousse pas les suivantes.
 *
 * @param {import('./model.js').Trip} trip séjour où le statut est déjà enregistré
 * @param {number} dayIndex
 * @param {string} stepId étape validée ou passée
 * @param {{ now: string, online: boolean, today?: string }} options now : "HH:mm" à destination
 * @returns {{ dayIndex: number, day: object, changes: object[], warnings: object[], weatherChecked: boolean }}
 */
export function reevaluatePlanning(trip, dayIndex, stepId, { now, online, today }, rules) {
  const day = trip.days[dayIndex];
  const original = day.steps;
  // Lieu où se trouve le voyageur : la dernière étape terminée (jusqu'à celle-ci).
  const here = [...original.slice(0, original.findIndex((s) => s.id === stepId) + 1)].reverse().find((s) => s.status === 'done' && s.place) ?? null;
  const cursor = { end: toMinutes(now), step: here };
  const ctx = { trip, dayIndex, day, mode: trip.mode, countryCode: trip.destination.countryCode, today, used: usedPlaceIds(trip), claims: new Set(), notBefore: cursor };
  /** @type {Map<string, { change: object, step: object | null }>} décisions : step null = étape retirée */
  const decisions = new Map();

  const rebuild = () =>
    original.flatMap((o) => {
      const d = decisions.get(o.id);
      if (!d) return [o];
      if (!d.step) return [];
      return [withTimes(d.step, startOf(o), startOf(o) + durationOf(d.step))];
    });

  let steps = original;
  for (let pass = 0; pass < MAX_PASSES; pass += 1) {
    const base = rebuild();
    const shifted = shiftFollowing(base, base.findIndex((s) => s.id === stepId), ctx, rules, { fixed: isFixedForTracking, cursor });
    steps = shifted.steps;
    // Étapes trop tardives, et déjeuner au restaurant décalé hors de ses horaires.
    const closedLunch = shifted.changes
      .map((c) => steps.find((s) => s.id === c.stepId))
      .filter((s) => s.type === 'lunch' && s.place?.category === 'restaurant' && infeasibility(s, startOf(s), endOf(s), ctx, rules).includes('CLOSED'))
      .map((s) => ({ stepId: s.id, reasons: ['CLOSED'] }));
    const pending = [...shifted.infeasible, ...closedLunch].filter((i) => !decisions.has(i.stepId) || decisions.get(i.stepId).step);
    if (!pending.length) break;
    const ignore = new Set(pending.map((i) => i.stepId));
    for (const item of pending) {
      ignore.delete(item.stepId);
      const resolved = resolveInfeasible(steps, item, { ...ctx, ignore }, rules);
      steps = resolved.steps;
      decisions.set(item.stepId, { change: resolved.change, step: steps.find((s) => s.id === item.stepId) ?? null });
    }
  }

  const after = (s) => steps.indexOf(s) > steps.findIndex((n) => n.id === stepId);
  const replacements = new Map();

  // c) Pluie sur les heures restantes (météo vérifiée seulement en ligne).
  const weatherChecked = Boolean(online);
  if (weatherChecked) {
    for (const s of steps.filter((n) => after(n) && !isFixedForTracking(n) && n.place && startOf(n) >= cursor.end)) {
      if (!infeasibility(s, startOf(s), endOf(s), ctx, rules).includes('RAIN')) continue;
      const replaced = findReplacement(steps, s.id, ['RAIN'], ctx, rules);
      if (replaced) {
        steps = replaced.steps;
        replacements.set(s.id, replaced.change);
      }
    }
  }

  // d) Trajet trop long depuis le lieu validé vers l'étape suivante.
  const next = steps.find((n) => after(n) && !isFixedForTracking(n) && n.place);
  if (here && next && !replacements.has(next.id) && legMinutes(here, next, trip.mode, rules) > rules.travel.maxTravelMin) {
    const replaced = findReplacement(steps, next.id, ['TRAVEL'], { ...ctx, from: here }, rules);
    if (replaced) {
      steps = replaced.steps;
      replacements.set(next.id, replaced.change);
    }
  }

  // Changements : comparaison avec la journée d'origine.
  const changes = [];
  for (const o of original) {
    const d = decisions.get(o.id);
    const final = steps.find((s) => s.id === o.id);
    const from = { start: o.start, end: o.end };
    if (!final) {
      changes.push({ ...d.change, from });
      continue;
    }
    const to = { start: final.start, end: final.end };
    if (final.place?.id !== o.place?.id) {
      const c = replacements.get(o.id) ?? d?.change;
      changes.push({ ...c, from, to });
    } else if (from.start !== to.start || from.end !== to.end) {
      changes.push({ kind: from.start !== to.start ? 'shifted' : 'shortened', stepId: o.id, name: stepName(o), from, to, customTime: Boolean(o.customTime) });
    }
  }
  const proposed = recomputeTravel({ ...day, steps }, trip, rules);
  return { dayIndex, day: proposed, changes, warnings: dayWarnings(proposed, null, rules), weatherChecked };
}
