import { eachDate } from './dates.js';
import { recomputeTravel } from './dayEdits.js';
import { dayLodgings } from './generateTrip.js';
import { dayWarnings } from './replanDay.js';
import { usedPlaceIds } from './replaceStep.js';
import { findReplacement } from './resolveInfeasible.js';
import { isFixed, legMinutes } from './stepTiming.js';

const sameLodging = (a, b) => (a?.id ?? null) === (b?.id ?? null) && a?.lat === b?.lat && a?.lon === b?.lon;

/**
 * Changement d'hébergement (ajout, modification, suppression) : recalcul de
 * chaque journée dont le point de départ ou d'arrivée change. Départ
 * conseillé et retour recalculés ; une première étape à plus de
 * rules.travel.maxTravelMin de l'hébergement est proposée au remplacement
 * par un lieu plus proche ; retour tardif signalé (LATE). Présenté dans le
 * panneau "Planning réajusté", appliqué par applyChanges (avec le séjour
 * qui porte les nouveaux hébergements).
 * @param {import('./model.js').Trip} trip séjour actuel
 * @param {import('./model.js').Lodging[]} lodgings nouveaux hébergements
 * @returns {{ trip: import('./model.js').Trip, proposal: { dayIndex: null, days: Record<number, object>, changes: object[], warnings: object[] } }}
 */
export function replanLodgings(trip, lodgings, rules) {
  const next = { ...trip, lodgings };
  const dates = eachDate(trip.startDate, trip.endDate);
  const used = usedPlaceIds(trip);
  const days = {};
  const changes = [];
  const warnings = [];

  trip.days.forEach((day, i) => {
    const index = dates.indexOf(day.date);
    const { start, end } = dayLodgings(lodgings, dates, index);
    const before = { start: trip.lodgings.find((l) => l.id === day.startLodgingId), end: trip.lodgings.find((l) => l.id === day.endLodgingId) };
    if (sameLodging(before.start, start) && sameLodging(before.end, end)) return;

    const moved = { ...day };
    if (start) moved.startLodgingId = start.id;
    else delete moved.startLodgingId;
    if (end) moved.endLodgingId = end.id;
    else delete moved.endLodgingId;
    let steps = moved.steps;

    // Première étape trop loin de l'hébergement : lieu plus proche proposé.
    const first = steps.find((s) => s.place && !isFixed(s));
    const from = start ? { id: `lodging:${start.id}`, place: start } : null;
    if (from && first && legMinutes(from, first, trip.mode, rules) > rules.travel.maxTravelMin) {
      const ctx = { trip: next, dayIndex: i, day: moved, mode: trip.mode, countryCode: trip.destination.countryCode, used, claims: new Set(), from };
      const replaced = findReplacement(steps, first.id, ['TRAVEL'], ctx, rules);
      if (replaced) {
        steps = replaced.steps;
        changes.push({ ...replaced.change, dayIndex: i, date: day.date });
      }
    }

    const recomputed = recomputeTravel({ ...moved, steps }, next, rules);
    days[i] = recomputed;
    changes.push({
      kind: 'departure',
      stepId: `departure:${day.date}`,
      dayIndex: i,
      date: day.date,
      from: day.departure?.time ?? null,
      to: recomputed.departure?.time ?? null,
      lodgingName: start ? (start.name ?? start.address) : null
    });
    for (const w of dayWarnings(recomputed, null, rules)) warnings.push({ ...w, dayIndex: i, date: day.date });
  });

  return { trip: next, proposal: { dayIndex: null, days, changes, warnings } };
}
