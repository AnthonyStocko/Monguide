import { durationsFor } from './activity.js';
import { adviseDeparture } from './departure.js';
import { fromMinutes, toMinutes } from './time.js';
import { routeKm, travelMinutes } from './travel.js';

/**
 * Horaires d'une journée, étapes dans l'ordre. Pour chaque étape :
 *  - début = heure du gabarit, ou plus tard si l'étape précédente et le
 *    trajet ne le permettent pas ;
 *  - fin = début + durée conseillée, raccourcie (jamais sous la durée
 *    minimale) pour ne pas empiéter sur le trajet vers l'étape suivante ;
 *  - l'étape suivante commence au plus tôt à fin + trajet : aucun
 *    chevauchement.
 * Une étape sans lieu (temps libre) n'a pas de trajet.
 *
 * @param {{ slotStart: string, place?: object, badges: string[], [k: string]: any }[]} steps étapes avec leur heure de gabarit
 * @param {{ from: { lat: number, lon: number } | null, to: { lat: number, lon: number } | null, mode: string }} ctx
 *   from : hébergement de départ ; to : hébergement d'arrivée
 * @returns {{ steps: object[], departure?: { time: string, travelMin: number }, returnTravelMin?: number, legsKm: number[] }}
 */
export function scheduleDay(steps, { from, to, mode }, rules) {
  const latest = toMinutes(rules.schedule.lastStepLatestStart);
  const travels = [];
  const legsKm = [];
  let prev = from;
  for (const step of steps) {
    if (step.place && prev) {
      travels.push(travelMinutes(prev, step.place, mode, rules));
      legsKm.push(routeKm(prev, step.place, rules));
    } else travels.push(0);
    if (step.place) prev = step.place;
  }

  const out = [];
  let previousEnd = null;
  steps.forEach((step, i) => {
    const template = toMinutes(step.slotStart);
    const start = previousEnd === null ? template : Math.max(template, previousEnd + travels[i]);
    const { recommendedMin, minimumMin } = durationsFor(step.place, rules);
    let end = start + recommendedMin;
    if (i + 1 < steps.length) {
      const limit = toMinutes(steps[i + 1].slotStart) - travels[i + 1];
      if (end > limit) end = Math.max(start + minimumMin, limit);
    }
    // Dernière étape commençant trop tard (rules.schedule.lastStepLatestStart) : abandonnée.
    if (start > latest) return;
    const { slotStart, ...rest } = step;
    const scheduled = { ...rest, start: fromMinutes(start), end: fromMinutes(end) };
    if (previousEnd !== null || from) scheduled.travelFromPreviousMin = travels[i];
    out.push(scheduled);
    previousEnd = end;
  });

  const result = { steps: out, legsKm };
  const departure = adviseDeparture(out, from, mode, rules);
  if (departure) result.departure = departure;
  const last = [...out].reverse().find((s) => s.place);
  if (to && last) {
    result.returnTravelMin = travelMinutes(last.place, to, mode, rules);
    legsKm.push(routeKm(last.place, to, rules));
  }
  return result;
}
