import { activityType, durationsFor, fitsSlot, isMarket } from './activity.js';
import { openingState, placeOpeningHours } from './openingHours.js';
import { fromMinutes, toMinutes } from './time.js';
import { travelMinutes } from './travel.js';
import { averageRain } from './weatherArbitration.js';

/**
 * Outils communs au recalcul d'une journée (replanDay, reevaluatePlanning) :
 * points fixes, trajets entre étapes, durées, faisabilité d'un créneau.
 * Heures en minutes depuis minuit, dans le fuseau du séjour.
 */

/** Étape personnelle (ajoutée par l'utilisateur). */
export const isPersonal = (step) => step.type === 'personal';

/**
 * Point fixe du recalcul : étape verrouillée (personnelle), horaire
 * personnalisé déjà accepté, ou étape déjà terminée / passée.
 */
export const isFixed = (step) => Boolean(step.locked || step.customTime || (step.status && step.status !== 'planned'));

/** Point fixe du suivi en temps réel : un horaire personnalisé peut y être décalé (en le signalant). */
export const isFixedForTracking = (step) => Boolean(step.locked || (step.status && step.status !== 'planned'));

/**
 * Trajet estimé (minutes) entre deux étapes ; 0 si l'une n'a pas de lieu
 * (temps libre, étape personnelle sans lieu : trajet inconnu).
 */
export function legMinutes(a, b, mode, rules) {
  return a?.place && b?.place ? travelMinutes(a.place, b.place, mode, rules) : 0;
}

export const startOf = (step) => toMinutes(step.start);
export const endOf = (step) => toMinutes(step.end);
export const durationOf = (step) => endOf(step) - startOf(step);

/** Durée minimale d'une étape (minutes) ; une étape personnelle n'en a pas. */
export function minimumFor(step, rules) {
  if (isPersonal(step)) return 1;
  return durationsFor(step.place, rules).minimumMin;
}

/** Durée conseillée d'une étape (minutes). */
export function recommendedFor(step, rules) {
  if (isPersonal(step)) return durationOf(step);
  return durationsFor(step.place, rules).recommendedMin;
}

/** Copie de l'étape avec de nouveaux horaires (minutes). */
export const withTimes = (step, start, end) => ({ ...step, start: fromMinutes(start), end: fromMinutes(end) });

/** Le lieu convient-il à ce type d'étape ? (déjeuner : restaurant ou marché) */
export function fitsStepType(place, type) {
  if (type === 'lunch') return place.category === 'restaurant' || isMarket(place);
  return fitsSlot(place, type);
}

/**
 * Raisons pour lesquelles un créneau n'est pas faisable (liste vide :
 * faisable). Codes : LATE_START (commence après
 * rules.schedule.lastStepLatestStart), LATE_END (finit après
 * rules.schedule.lateEnd), TOO_SHORT, CLOSED (horaires d'ouverture connus),
 * RAIN (lieu extérieur, pluie au-delà du seuil, météo connue).
 * @param {object} step étape (lieu, type)
 * @param {number} start minutes
 * @param {number} end minutes
 * @param {{ day: object, countryCode: string }} ctx
 * @returns {string[]}
 */
export function infeasibility(step, start, end, { day, countryCode }, rules) {
  const reasons = [];
  if (start > toMinutes(rules.schedule.lastStepLatestStart)) reasons.push('LATE_START');
  if (end > toMinutes(rules.schedule.lateEnd)) reasons.push('LATE_END');
  if (end - start < minimumFor(step, rules)) reasons.push('TOO_SHORT');
  const place = step.place;
  if (place && !isPersonal(step) && end > start) {
    const state = openingState(placeOpeningHours(place), { date: day.date, from: fromMinutes(start), to: fromMinutes(end), lat: place.lat, lon: place.lon, countryCode });
    if (state === 'closed' || state === 'partial') reasons.push('CLOSED');
    if (place.indoor !== true && day.weatherAvailable && day.weather) {
      const rain = averageRain(day.weather, fromMinutes(start), fromMinutes(end));
      if (rain !== null && rain > rules.weather.rainThresholdPct) reasons.push('RAIN');
    }
  }
  return reasons;
}

/** Nom lisible d'une étape pour les panneaux (lieu, titre, sinon null = temps libre). */
export const stepName = (step) => step.place?.name ?? step.title ?? null;

/** Type d'activité (pour les messages) d'une étape. */
export const stepActivity = (step) => (step.place && !isPersonal(step) ? activityType(step.place) : 'relax');
