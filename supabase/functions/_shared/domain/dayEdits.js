import { checkSlotTiming } from './checkSlotTiming.js';
import { fromMinutes, toMinutes } from './time.js';
import { travelMinutes } from './travel.js';

/**
 * Modifications d'une journée du planning (fonctions pures, utilisables
 * hors ligne).
 */

const lodgingById = (trip, id) => (id ? trip.lodgings.find((l) => l.id === id) ?? null : null);

/**
 * Temps de trajet d'une journée recalculés d'après les lieux et les
 * hébergements : trajet depuis l'étape précédente, départ et retour.
 * @param {object} day
 * @param {import('./model.js').Trip} trip
 * @returns {object} nouvelle journée
 */
export function recomputeTravel(day, trip, rules) {
  const start = lodgingById(trip, day.startLodgingId);
  const end = lodgingById(trip, day.endLodgingId);
  let prev = start;
  let hasPrevious = Boolean(start);
  const steps = day.steps.map((s) => {
    const out = { ...s };
    if (hasPrevious) out.travelFromPreviousMin = s.place && prev ? travelMinutes(prev, s.place, trip.mode, rules) : 0;
    if (s.place) prev = s.place;
    // Étape personnelle sans lieu : trajet suivant inconnu (pas recalculé depuis l'étape d'avant).
    else if (s.type === 'personal') prev = null;
    hasPrevious = true;
    return out;
  });
  const next = { ...day, steps };
  const first = steps.find((s) => s.place);
  const last = [...steps].reverse().find((s) => s.place);
  if (start && first) {
    const travelMin = travelMinutes(start, first.place, trip.mode, rules);
    next.departure = { time: fromMinutes(toMinutes(first.start) - travelMin), travelMin };
  } else delete next.departure;
  if (end && last) next.returnTravelMin = travelMinutes(last.place, end, trip.mode, rules);
  else delete next.returnTravelMin;
  return next;
}

/**
 * Applique un horaire réglé à la main (customTime = true). Avec
 * shiftFollowing, les étapes suivantes sont décalées du même écart que la fin
 * de l'étape modifiée.
 * @param {object} day
 * @param {number} index
 * @param {{ start: string, end: string, shiftFollowing?: boolean }} timing
 * @returns {object} nouvelle journée
 */
export function applyTiming(day, index, { start, end, shiftFollowing = false }) {
  const delta = toMinutes(end) - toMinutes(day.steps[index].end);
  const steps = day.steps.map((s, i) => {
    if (i === index) return { ...s, start, end, customTime: true };
    if (shiftFollowing && i > index && delta !== 0) {
      return { ...s, start: fromMinutes(toMinutes(s.start) + delta), end: fromMinutes(toMinutes(s.end) + delta) };
    }
    return s;
  });
  return { ...day, steps };
}

/**
 * Avertissements de chaque étape d'une journée (horaires actuels), plus
 * STARTS_TOO_LATE pour une étape commençant après rules.schedule.lastStepLatestStart.
 * @returns {Record<string, { code: string, [k: string]: any }[]>} par identifiant d'étape
 */
export function checkDay(day, { mode, countryCode }, rules) {
  const latest = toMinutes(rules.schedule.lastStepLatestStart);
  const out = {};
  day.steps.forEach((s, index) => {
    const { warnings } = checkSlotTiming({ day, index, start: s.start, end: s.end, mode, countryCode }, rules);
    if (toMinutes(s.start) > latest) warnings.push({ code: 'STARTS_TOO_LATE', latest: rules.schedule.lastStepLatestStart });
    if (warnings.length) out[s.id] = warnings;
  });
  return out;
}
