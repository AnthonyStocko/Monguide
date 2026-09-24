import { toMinutes } from './time.js';
import {
  durationOf,
  endOf,
  fitsStepType,
  infeasibility,
  isPersonal,
  legMinutes,
  minimumFor,
  recommendedFor,
  startOf,
  stepName,
  withTimes
} from './stepTiming.js';

/**
 * Étape devenue infaisable (trop courte, trop tard, fermée, pluie…) :
 * solutions essayées dans cet ordre de préférence :
 *  1. raccourcir jusqu'au minimum (plage libre entre les étapes voisines) ;
 *  2. remplacer par un lieu de trip.candidates plus proche ou plus court,
 *     convenant au créneau et ouvert sur la plage libre ;
 *  3. reporter sur un autre jour du séjour ayant un "Temps libre" du même
 *     type ou une plage libre suffisante ;
 *  4. supprimer.
 * Une étape reportée ou supprimée quitte la journée ; le choix entre les
 * deux reste proposé à l'utilisateur (change.target = jour de report).
 * Les étapes sans lieu (temps libre) sont seulement raccourcies ou supprimées.
 *
 * @param {object[]} steps étapes de la journée (l'étape infaisable encore présente)
 * @param {{ stepId: string, reasons: string[] }} item
 * @param {{
 *   trip: object, dayIndex: number, day: object, mode: string, countryCode: string,
 *   today?: string, used: Set<string>, claims: Set<string>, ignore?: Set<string>,
 *   notBefore?: { end: number, step: object | null }
 * }} ctx used : lieux déjà utilisés dans le séjour ; claims : plages de report déjà prises ;
 *   notBefore : suivi en temps réel, heure actuelle (minutes) et lieu où se trouve le voyageur
 * @returns {{ steps: object[], change: object }}
 */
export function resolveInfeasible(steps, { stepId, reasons }, ctx, rules) {
  const index = steps.findIndex((s) => s.id === stepId);
  const s = steps[index];
  const ignore = ctx.ignore ?? new Set();
  const prev = [...steps.slice(0, index)].reverse().find((n) => !ignore.has(n.id)) ?? null;
  const next = steps.slice(index + 1).find((n) => !ignore.has(n.id)) ?? null;
  const lateEnd = toMinutes(rules.schedule.lateEnd);

  /** Plage [début, fin max] d'une étape candidate à cette position. */
  const range = (candidate) => {
    const start = Math.max(prev ? Math.max(startOf(s), endOf(prev) + legMinutes(prev, candidate, ctx.mode, rules)) : startOf(s), notBefore(ctx, candidate, rules));
    const limit = next ? startOf(next) - legMinutes(candidate, next, ctx.mode, rules) : lateEnd;
    return { start, limit };
  };
  const feasible = (candidate, start, end) => end - start >= minimumFor(candidate, rules) && infeasibility(candidate, start, end, ctx, rules).length === 0;
  const replaceIn = (list, value) => list.map((n) => (n.id === stepId ? value : n));
  const base = { stepId, name: stepName(s), reason: reasons[0] ?? 'TOO_SHORT', customTime: Boolean(s.customTime) };

  // 1. Raccourcir jusqu'au minimum.
  {
    const { start, limit } = range(s);
    const end = Math.min(start + durationOf(s), limit);
    if (feasible(s, start, end)) {
      const shortened = withTimes(s, start, end);
      return { steps: replaceIn(steps, shortened), change: { ...base, kind: start !== startOf(s) ? 'shifted' : 'shortened', from: { start: s.start, end: s.end }, to: { start: shortened.start, end: shortened.end } } };
    }
  }

  if (s.place && !isPersonal(s)) {
    // 2. Remplacer par un lieu plus proche ou plus court, ouvert sur la plage libre.
    const replacement = findReplacement(steps, stepId, reasons, ctx, rules);
    if (replacement) return replacement;

    // 3. Reporter sur un autre jour du séjour.
    const target = findPostponeTarget(s, ctx, rules);
    const dropped = steps.filter((n) => n.id !== stepId);
    if (target) {
      ctx.claims.add(target.key);
      return { steps: dropped, change: { ...base, kind: 'postponed', from: { start: s.start, end: s.end }, step: s, target } };
    }
  }

  // 4. Supprimer.
  return { steps: steps.filter((n) => n.id !== stepId), change: { ...base, kind: 'removed', from: { start: s.start, end: s.end }, step: s, target: null } };
}

/**
 * Jour de report d'une étape : un "Temps libre" du même type, ou (hors
 * déjeuner) une plage libre suffisante entre deux étapes ou en fin de
 * journée, sur un autre jour du séjour postérieur à aujourd'hui.
 * @returns {{ key: string, dayIndex: number, date: string, start: string, end: string, freeStepId?: string } | null}
 */
export function findPostponeTarget(step, ctx, rules) {
  const latest = toMinutes(rules.schedule.lastStepLatestStart);
  const lateEnd = toMinutes(rules.schedule.lateEnd);
  const minimum = minimumFor(step, rules);
  const wanted = recommendedFor(step, rules);
  const fmt = (m) => withTimes(step, m, m).start;

  for (let d = 0; d < ctx.trip.days.length; d += 1) {
    const day = ctx.trip.days[d];
    if (d === ctx.dayIndex || (ctx.today && day.date <= ctx.today)) continue;
    const dayCtx = { day, countryCode: ctx.countryCode };
    const ok = (start, end) => end - start >= minimum && start <= latest && infeasibility(step, start, end, dayCtx, rules).length === 0;

    // Temps libre du même type.
    for (const free of day.steps) {
      const key = `${d}:${free.id}`;
      if (free.place || isPersonal(free) || free.type !== step.type || ctx.claims.has(key) || (free.status && free.status !== 'planned')) continue;
      const start = startOf(free);
      const end = Math.min(start + wanted, endOf(free));
      if (ok(start, end)) return { key, dayIndex: d, date: day.date, start: fmt(start), end: fmt(end), freeStepId: free.id };
    }
    if (step.type === 'lunch') continue;

    // Plage libre entre deux étapes, ou après la dernière.
    const steps = day.steps;
    for (let i = 0; i < steps.length; i += 1) {
      const a = steps[i];
      const b = steps[i + 1] ?? null;
      const key = `${d}:after:${a.id}`;
      if (ctx.claims.has(key)) continue;
      const start = endOf(a) + legMinutes(a, step, ctx.mode, rules);
      const limit = b ? startOf(b) - legMinutes(step, b, ctx.mode, rules) : lateEnd;
      const end = Math.min(start + wanted, limit);
      if (ok(start, end)) return { key, dayIndex: d, date: day.date, start: fmt(start), end: fmt(end), afterStepId: a.id };
    }
  }
  return null;
}

/**
 * Remplaçant d'une étape (sans report ni suppression) : lieu de
 * trip.candidates non utilisé, convenant au créneau, à au plus
 * rules.travel.maxTravelMin des étapes voisines, faisable sur la plage libre
 * (ouvert, à l'abri s'il pleut, durée minimale) ; le plus proche, puis le plus court.
 * @param {object[]} steps
 * @param {string} stepId
 * @param {string[]} reasons raisons (la première est reprise dans le changement)
 * @param {object} ctx voir resolveInfeasible ; ctx.from : étape d'où l'on part (suivi), sinon l'étape précédente
 * @returns {{ steps: object[], change: object } | null}
 */
export function findReplacement(steps, stepId, reasons, ctx, rules) {
  const index = steps.findIndex((s) => s.id === stepId);
  const s = steps[index];
  if (!s?.place || isPersonal(s)) return null;
  const ignore = ctx.ignore ?? new Set();
  const prev = ctx.from ?? ([...steps.slice(0, index)].reverse().find((n) => !ignore.has(n.id)) ?? null);
  const next = steps.slice(index + 1).find((n) => !ignore.has(n.id)) ?? null;
  const lateEnd = toMinutes(rules.schedule.lateEnd);
  const maxTravel = rules.travel.maxTravelMin;
  // Pluie : comme l'arbitrage météo de la génération, un musée ou monument intérieur remplace une visite extérieure.
  const rainShelter = (p) => reasons[0] === 'RAIN' && s.type !== 'lunch' && p.indoor === true && (p.category === 'museum' || p.category === 'monument');
  const options = (ctx.trip.candidates ?? [])
    .filter((p) => !ctx.used.has(p.id) && (fitsStepType(p, s.type) || rainShelter(p)))
    .map((p) => {
      const candidate = { ...s, place: p, indoor: p.indoor, badges: rainShelter(p) ? ['weather_adapted'] : [] };
      const legIn = legMinutes(prev, candidate, ctx.mode, rules);
      const legOut = legMinutes(candidate, next, ctx.mode, rules);
      const start = Math.max(prev && !ctx.from ? Math.max(startOf(s), endOf(prev) + legIn) : startOf(s), notBefore(ctx, candidate, rules));
      const limit = next ? startOf(next) - legOut : lateEnd;
      const end = Math.min(start + recommendedFor(candidate, rules), limit);
      const ok = legIn <= maxTravel && legOut <= maxTravel && end - start >= minimumFor(candidate, rules) && infeasibility(candidate, start, end, ctx, rules).length === 0;
      return { p, candidate, start, end, legs: legIn + legOut, ok };
    })
    .filter((o) => o.ok)
    .sort((a, b) => a.legs - b.legs || minimumFor(a.candidate, rules) - minimumFor(b.candidate, rules));
  if (!options.length) return null;
  const best = options[0];
  const replaced = withTimes(best.candidate, best.start, best.end);
  ctx.used.add(best.p.id);
  return {
    steps: steps.map((n) => (n.id === stepId ? replaced : n)),
    change: {
      kind: 'replaced',
      stepId,
      reason: reasons[0] ?? 'TOO_SHORT',
      customTime: Boolean(s.customTime),
      name: best.p.name,
      previousName: s.place.name,
      fromPlace: s.place,
      toPlace: best.p,
      from: { start: s.start, end: s.end },
      to: { start: replaced.start, end: replaced.end }
    }
  };
}

/** Début au plus tôt imposé par le suivi : heure actuelle + trajet depuis le lieu du voyageur. */
function notBefore(ctx, candidate, rules) {
  if (!ctx.notBefore) return 0;
  return ctx.notBefore.end + legMinutes(ctx.notBefore.step, candidate, ctx.mode, rules);
}
