import { scheduleLimits } from './activity.js';
import { checkDayInvariants } from './checkDayInvariants.js';
import { checkSlotTiming } from './checkSlotTiming.js';
import { recomputeTravel } from './dayEdits.js';
import { openingState, placeOpeningHours } from './openingHours.js';
import { REVIEW_TEXT_MAX } from './reviewSchema.js';
import { replaceStepPlace, usedPlaceIds } from './replaceStep.js';
import { endOf, fitsStepType, isFixed, isPersonal, legMinutes, startOf, withTimes } from './stepTiming.js';
import { toMinutes } from './time.js';

/**
 * Application de la réponse de l'IA de relecture (docs/ai-review.md). L'IA
 * propose, le code vérifie : chaque opération est appliquée sur une copie,
 * dans l'ordre reçu, puis contrôlée ; au moindre échec elle est annulée et
 * notée dans rejectedOps avec sa raison technique. Les étapes fixes
 * (personnelles, horaires choisis, terminées ou passées) ne sont jamais
 * touchées. Fonction pure.
 *
 * Opérations :
 *  - swap : deux étapes du même jour échangent leurs plages horaires (repas
 *    avec repas, visite avec visite) ;
 *  - replace : le lieu d'une étape devient un candidat de la réserve, de
 *    type compatible (un restaurant ne remplace qu'un repas), jamais déjà
 *    utilisé, ouvert sur la plage (horaires inconnus : accepté, comme à la
 *    génération), à au plus rules.travel.maxTravelMin des étapes voisines ;
 *  - shift : une étape commence à newStart, même durée, même ordre.
 * Contrôles après chaque opération : checkSlotTiming des étapes touchées
 * (aucun chevauchement, lieu ouvert, durée minimale, fin tardive, début au
 * plus tard ; pluie : refusée si elle n'était pas déjà prévue sur l'étape),
 * puis checkDayInvariants sur la journée.
 */

/** Raisons techniques d'un refus (rejectedOps[].rejection). */
export const REVIEW_REJECTIONS = Object.freeze([
  'max_ops',
  'malformed',
  'unknown_step',
  'unknown_candidate',
  'locked_step',
  'same_step',
  'different_days',
  'meal_mismatch',
  'candidate_used',
  'candidate_type',
  'closed',
  'travel',
  'invalid_time',
  'overlap',
  'too_short',
  'late',
  'rain',
  'invariants'
]);

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** Caractères de contrôle et séparateurs de ligne Unicode (U+2028, U+2029). */
const CONTROL_CHARS = new RegExp(`[\\u0000-\\u001f\\u007f-\\u009f${String.fromCharCode(0x2028, 0x2029)}]+`, 'g');
const isMeal = (step) => step.type === 'lunch' || step.type === 'dinner';
const WARNING_REJECTIONS = { INVALID: 'invalid_time', OVERLAP_PREVIOUS: 'overlap', OVERLAP_NEXT: 'overlap', CLOSED: 'closed', TOO_SHORT: 'too_short', LATE: 'late' };

/**
 * Texte brut pour l'affichage : sans balise HTML, sans lien, sans caractère
 * de contrôle, sur une ligne ; null s'il est vide ou trop long.
 * @param {unknown} value
 * @param {number} max
 * @returns {string | null}
 */
export function plainText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(CONTROL_CHARS, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text && text.length <= max ? text : null;
}

/** Position d'une étape dans le séjour. */
function locate(trip, stepId) {
  for (let d = 0; d < trip.days.length; d += 1) {
    const i = trip.days[d].steps.findIndex((s) => s.id === stepId);
    if (i >= 0) return { dayIndex: d, stepIndex: i, step: trip.days[d].steps[i] };
  }
  return null;
}

/** Avertissements (codes) d'une étape à sa place dans la journée, début au plus tard compris. */
function stepWarnings(day, stepId, ctx, rules) {
  const index = day.steps.findIndex((s) => s.id === stepId);
  const s = day.steps[index];
  const codes = checkSlotTiming({ day, index, start: s.start, end: s.end, mode: ctx.mode, countryCode: ctx.countryCode }, rules).warnings.map((w) => w.code);
  if (startOf(s) > toMinutes(scheduleLimits(s, rules).latestStart)) codes.push('LATE');
  return codes;
}

/**
 * Contrôle d'une journée modifiée : raison du refus, ou null si elle est acceptable.
 * @param {object} before journée avant l'opération
 * @param {object} after journée après l'opération
 * @param {string[]} touched étapes modifiées
 */
function dayRejection(before, after, touched, nextTrip, ctx, rules, { reordered }) {
  for (const id of touched) {
    const now = stepWarnings(after, id, ctx, rules);
    const hadRain = before.steps.some((s) => s.id === id) && stepWarnings(before, id, ctx, rules).includes('RAIN');
    for (const code of now) {
      if (WARNING_REJECTIONS[code]) return WARNING_REJECTIONS[code];
      if (code === 'RAIN' && !hadRain) return 'rain';
    }
  }
  // Un échange change l'ordre des étapes : contrôle d'ordre sans objet (points fixes vérifiés à part).
  const violations = checkDayInvariants(after, { before: reordered ? undefined : before, trip: nextTrip, mode: ctx.mode }, rules);
  if (violations.length) return 'invariants';
  // Étapes fixes : ni déplacées, ni modifiées (seul le trajet depuis l'étape d'avant peut être recalculé).
  const fixedBefore = before.steps.filter((s) => isFixed(s) || isPersonal(s));
  if (fixedBefore.some((f) => fixedSignature(after.steps.find((s) => s.id === f.id)) !== fixedSignature(f))) return 'invariants';
  return null;
}

/** Contenu d'une étape fixe qui ne doit jamais changer. */
export function fixedSignature(step) {
  if (!step) return null;
  const { travelFromPreviousMin: _travel, conflicts: _conflicts, ...rest } = step;
  return JSON.stringify(rest);
}

const withDay = (trip, dayIndex, day) => ({ ...trip, days: trip.days.map((d, i) => (i === dayIndex ? day : d)) });

/** Une opération : { trip } appliquée, ou { rejection }. */
function applyOperation(trip, op, resolve, ctx, rules) {
  if (!op || typeof op !== 'object' || !['swap', 'replace', 'shift'].includes(op.op)) return { rejection: 'malformed' };
  const editable = (alias) => {
    const found = locate(trip, resolve.step(alias));
    if (!found) return { rejection: 'unknown_step' };
    if (isFixed(found.step) || isPersonal(found.step)) return { rejection: 'locked_step' };
    return found;
  };

  if (op.op === 'swap') {
    const a = editable(op.stepA);
    if (a.rejection) return a;
    const b = editable(op.stepB);
    if (b.rejection) return b;
    if (a.step.id === b.step.id) return { rejection: 'same_step' };
    if (a.dayIndex !== b.dayIndex) return { rejection: 'different_days' };
    if (isMeal(a.step) !== isMeal(b.step)) return { rejection: 'meal_mismatch' };
    const before = trip.days[a.dayIndex];
    const swapped = before.steps
      .map((s) => (s.id === a.step.id ? withTimes(s, startOf(b.step), endOf(b.step)) : s.id === b.step.id ? withTimes(s, startOf(a.step), endOf(a.step)) : s))
      .sort((x, y) => startOf(x) - startOf(y));
    const after = recomputeTravel({ ...before, steps: swapped }, trip, rules);
    const next = withDay(trip, a.dayIndex, after);
    const rejection = dayRejection(before, after, [a.step.id, b.step.id], next, ctx, rules, { reordered: true });
    return rejection ? { rejection } : { trip: next, applied: { op: 'swap', dayIndex: a.dayIndex, stepA: a.step.id, stepB: b.step.id } };
  }

  if (op.op === 'replace') {
    const target = editable(op.step);
    if (target.rejection) return target;
    const candidateId = resolve.candidate(op.candidate);
    const candidate = (trip.candidates ?? []).find((p) => p.id === candidateId);
    if (!candidate) return { rejection: 'unknown_candidate' };
    if (usedPlaceIds(trip).has(candidate.id)) return { rejection: 'candidate_used' };
    if (!target.step.place || !fitsStepType(candidate, target.step.type, ctx.profile)) return { rejection: 'candidate_type' };
    const { step } = target;
    const state = openingState(placeOpeningHours(candidate), { date: trip.days[target.dayIndex].date, from: step.start, to: step.end, lat: candidate.lat, lon: candidate.lon, countryCode: ctx.countryCode });
    if (state === 'closed' || state === 'partial') return { rejection: 'closed' };
    const before = trip.days[target.dayIndex];
    const prev = before.steps[target.stepIndex - 1];
    const nextStep = before.steps[target.stepIndex + 1];
    const probe = { ...step, place: candidate };
    if (legMinutes(prev, probe, ctx.mode, rules) > rules.travel.maxTravelMin || legMinutes(probe, nextStep, ctx.mode, rules) > rules.travel.maxTravelMin) return { rejection: 'travel' };
    const next = replaceStepPlace(trip, target.dayIndex, target.stepIndex, candidate, rules);
    const after = next.days[target.dayIndex];
    const rejection = dayRejection(before, after, [step.id], next, ctx, rules, { reordered: false });
    return rejection
      ? { rejection }
      : { trip: next, applied: { op: 'replace', dayIndex: target.dayIndex, step: step.id, from: step.place?.id ?? null, candidate: candidate.id } };
  }

  // shift
  const target = editable(op.step);
  if (target.rejection) return target;
  if (typeof op.newStart !== 'string' || !HHMM.test(op.newStart)) return { rejection: 'invalid_time' };
  const { step } = target;
  const start = toMinutes(op.newStart);
  const end = start + (endOf(step) - startOf(step));
  if (end >= 24 * 60) return { rejection: 'invalid_time' };
  if (start === startOf(step)) return { rejection: 'invalid_time' };
  const before = trip.days[target.dayIndex];
  const after = recomputeTravel({ ...before, steps: before.steps.map((s) => (s.id === step.id ? withTimes(s, start, end) : s)) }, trip, rules);
  const next = withDay(trip, target.dayIndex, after);
  const rejection = dayRejection(before, after, [step.id], next, ctx, rules, { reordered: false });
  return rejection ? { rejection } : { trip: next, applied: { op: 'shift', dayIndex: target.dayIndex, step: step.id, from: step.start, newStart: op.newStart } };
}

/**
 * @param {import('./model.js').Trip} trip séjour généré, pas encore relu
 * @param {{
 *   ok: boolean, reason?: string, json?: any, provider?: string, model?: string,
 *   ids?: { steps: Record<string, string>, candidates: Record<string, string> }
 * }} response résultat de complete() (ai/complete.js) ; ids : alias du résumé (buildReviewRequest).
 *   Sans ids, les identifiants reçus sont les identifiants réels.
 * @param {{ now?: string }} [options] now : date ISO de la relecture
 * @returns {import('./model.js').Trip} copie du séjour, relue, avec trip.review
 */
export function applyReview(trip, response, rules, { now = new Date().toISOString() } = {}) {
  const base = { provider: response?.provider ?? null, model: response?.model ?? null, reviewedAt: now };
  const json = response?.json;
  if (!response?.ok || !json || typeof json !== 'object' || !Array.isArray(json.operations)) {
    const reason = response?.ok ? 'invalid_json' : (response?.reason ?? 'error');
    return { ...trip, review: { status: 'skipped', reason, ...base, appliedOps: [], rejectedOps: [], dayTitles: {}, summary: null, originalDays: null } };
  }

  const map = (table, alias) => (response.ids ? table?.[alias] : alias);
  const resolve = { step: (alias) => map(response.ids?.steps, alias), candidate: (alias) => map(response.ids?.candidates, alias) };
  const ctx = { mode: trip.mode, countryCode: trip.destination.countryCode, profile: trip.profile };
  const original = { days: structuredClone(trip.days), candidates: structuredClone(trip.candidates ?? []) };

  let current = structuredClone(trip);
  const appliedOps = [];
  const rejectedOps = [];
  json.operations.forEach((op, index) => {
    const received = { index, op: typeof op?.op === 'string' ? op.op.slice(0, 20) : null };
    if (appliedOps.length + rejectedOps.length >= rules.ai.maxOpsPerTrip) {
      rejectedOps.push({ ...received, rejection: 'max_ops' });
      return;
    }
    let result;
    try {
      result = applyOperation(current, op, resolve, ctx, rules);
    } catch {
      result = { rejection: 'malformed' };
    }
    if (result.rejection) {
      rejectedOps.push({ ...received, rejection: result.rejection });
      return;
    }
    current = result.trip;
    appliedOps.push({ ...result.applied, reason: plainText(op.reason, REVIEW_TEXT_MAX.reason) });
  });

  // Titres : texte brut, longueur vérifiée, dates du séjour seulement.
  const dates = new Set(trip.days.map((d) => d.date));
  const dayTitles = {};
  for (const [date, title] of Object.entries(json.dayTitles && typeof json.dayTitles === 'object' ? json.dayTitles : {})) {
    const text = dates.has(date) ? plainText(title, REVIEW_TEXT_MAX.dayTitle) : null;
    if (text) dayTitles[date] = text;
  }

  const changed = appliedOps.length > 0;
  return {
    ...current,
    review: {
      status: changed ? 'applied' : 'unchanged',
      ...base,
      appliedOps,
      rejectedOps,
      dayTitles,
      summary: plainText(json.summary, REVIEW_TEXT_MAX.summary),
      originalDays: changed ? original.days : null,
      ...(changed ? { originalCandidates: original.candidates } : {})
    }
  };
}

/**
 * Retour à la version d'origine : jours (et réserve) d'avant la relecture,
 * relecture marquée "reverted". Sans relecture appliquée : séjour inchangé.
 * @param {import('./model.js').Trip} trip
 * @returns {import('./model.js').Trip}
 */
export function revertReview(trip) {
  const review = trip.review;
  if (review?.status !== 'applied' || !review.originalDays) return trip;
  const { originalDays, originalCandidates, ...rest } = review;
  return {
    ...trip,
    days: structuredClone(originalDays),
    candidates: structuredClone(originalCandidates ?? trip.candidates),
    review: { ...rest, status: 'reverted', originalDays: null }
  };
}
