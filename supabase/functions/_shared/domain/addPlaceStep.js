import { stepDurations } from './activity.js';
import { stepTypeFor } from './config/activityTypes.js';
import { fromMinutes, toMinutes } from './time.js';
import { travelMinutes } from './travel.js';

/**
 * Ajout d'une étape à partir d'un lieu choisi dans une liste (parcours
 * « + Ajouter une étape ») : heures proposées et construction de l'étape.
 * L'étape a un horaire choisi par l'utilisateur (customTime) : elle est un
 * point fixe du recalcul (replanDay), comme une étape personnelle, mais
 * reste remplaçable (locked false).
 */

/** Dernière minute d'une journée proposée à l'ajout. */
const LAST = 23 * 60 + 55;

/** Arrondi aux 5 minutes supérieures (pas des sélecteurs d'heure). */
export const roundUp5 = (minutes) => Math.min(LAST, Math.ceil(minutes / 5) * 5);

/**
 * Heure de début proposée en tête de liste : fin de l'étape précédente
 * (afterIndex), sinon début de la suivante, sinon rules.dayTemplate.culture ;
 * arrondie aux 5 minutes.
 * @param {object} day
 * @param {number} afterIndex position de l'étape précédente (-1 : en tête de journée)
 * @returns {string} "HH:mm"
 */
export function defaultListTime(day, afterIndex, rules) {
  const prev = day.steps[afterIndex];
  const next = day.steps[afterIndex + 1];
  const base = prev ? toMinutes(prev.end) : next ? toMinutes(next.start) : toMinutes(rules.dayTemplate.culture);
  return fromMinutes(roundUp5(base));
}

/**
 * Heures proposées pour un lieu : début = heure choisie en tête de liste, ou
 * plus tard si le trajet depuis l'étape précédente ne le permet pas (fin de
 * l'étape précédente + trajet, arrondi aux 5 minutes) ; fin = début + durée
 * conseillée du type d'étape.
 * @param {{ day: object, afterIndex: number, place: object, type: string, time: string, mode: string }} input
 *   type : type proposé (config/activityTypes.js) ; time : heure choisie en tête de liste
 * @returns {{ start: string, end: string, stepType: string }}
 */
export function proposedTimes({ day, afterIndex, place, type, time, mode }, rules) {
  const prev = day.steps[afterIndex];
  let start = toMinutes(time);
  if (prev) {
    const travel = prev.place ? travelMinutes(prev.place, place, mode, rules) : 0;
    start = Math.max(start, roundUp5(toMinutes(prev.end) + travel));
  }
  start = Math.min(start, LAST - 5);
  const stepType = stepTypeFor(type, fromMinutes(start), rules);
  const { recommendedMin } = stepDurations({ type: stepType, place }, rules);
  return { start: fromMinutes(start), end: fromMinutes(Math.min(start + recommendedMin, LAST)), stepType };
}

/**
 * Étape (Step) d'un lieu ajouté par l'utilisateur.
 * @param {{ id: string, type: string, place: object, start: string, end: string, badges?: string[] }} input
 *   type : type proposé ; le type d'étape suit l'heure de début (stepTypeFor)
 * @returns {object}
 */
export function makePlaceStep({ id, type, place, start, end, badges = [] }, rules) {
  return {
    id,
    type: stepTypeFor(type, start, rules),
    start,
    end,
    place,
    indoor: place.indoor ?? null,
    status: 'planned',
    customTime: true,
    locked: false,
    badges: badges.filter((b) => b === 'hours_unconfirmed' || b === 'info_missing')
  };
}
