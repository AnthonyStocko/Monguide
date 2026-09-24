import { fromMinutes, toMinutes } from './time.js';
import { travelMinutes } from './travel.js';

/**
 * Départ conseillé de l'hébergement pour une journée.
 *  - Cas général : début de la première étape ayant un lieu, moins le trajet.
 *  - Journée qui commence par un temps libre (étape sans lieu, hors étape
 *    personnelle) : départ à rules.dayTemplate.departure (09:00), au plus
 *    tard au début de ce temps libre.
 * Le trajet indiqué est toujours celui vers la première étape ayant un lieu.
 * Aucun départ sans hébergement de départ ni étape ayant un lieu.
 * @param {object[]} steps étapes de la journée, dans l'ordre
 * @param {{ lat: number, lon: number } | null} from hébergement de départ
 * @param {string} mode
 * @returns {{ time: string, travelMin: number } | null}
 */
export function adviseDeparture(steps, from, mode, rules) {
  const first = steps.find((s) => s.place);
  if (!from || !first) return null;
  const travelMin = travelMinutes(from, first.place, mode, rules);
  const opening = steps[0];
  if (!opening.place && opening.type !== 'personal') {
    return { time: fromMinutes(Math.min(toMinutes(rules.dayTemplate.departure), toMinutes(opening.start))), travelMin };
  }
  return { time: fromMinutes(toMinutes(first.start) - travelMin), travelMin };
}
