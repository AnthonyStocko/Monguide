import { activityType, durationsFor } from './activity.js';
import { openingState, placeOpeningHours } from './openingHours.js';
import { toMinutes } from './time.js';
import { travelMinutes } from './travel.js';
import { averageRain } from './weatherArbitration.js';

/**
 * Vérifie un nouvel horaire d'étape (réglage manuel). Renvoie des
 * avertissements codés, traduits par l'application ; seul INVALID est
 * bloquant (fin avant ou égale au début).
 *
 * Codes : TOO_SHORT, OVERLAP_PREVIOUS, OVERLAP_NEXT, CLOSED, RAIN, LATE, INVALID.
 * Une durée inférieure à la durée conseillée mais au-dessus du minimum n'est
 * pas un avertissement : simple indication (belowRecommended).
 *
 * @param {{
 *   day: { date: string, weatherAvailable: boolean, weather?: Record<string, number>, steps: object[] },
 *   index: number,
 *   start: string,
 *   end: string,
 *   mode: 'walk' | 'transit' | 'bike' | 'car',
 *   countryCode: string
 * }} input
 * @returns {{ warnings: { code: string, [k: string]: any }[], blocking: boolean, belowRecommended: boolean, durationMin: number }}
 */
export function checkSlotTiming({ day, index, start, end, mode, countryCode }, rules) {
  const step = day.steps[index];
  const from = toMinutes(start);
  const to = toMinutes(end);
  const durationMin = to - from;
  if (durationMin <= 0) return { warnings: [{ code: 'INVALID' }], blocking: true, belowRecommended: false, durationMin };

  const warnings = [];
  const place = step.place;
  const { recommendedMin, minimumMin } = durationsFor(place, rules);
  if (durationMin < minimumMin) warnings.push({ code: 'TOO_SHORT', activity: place ? activityType(place) : 'relax', minimumMin, durationMin });

  const prev = day.steps[index - 1];
  if (prev) {
    const travelMin = prev.place && place ? travelMinutes(prev.place, place, mode, rules) : 0;
    if (from < toMinutes(prev.end) + travelMin) warnings.push({ code: 'OVERLAP_PREVIOUS', travelMin, previousEnd: prev.end, mode });
  }
  const next = day.steps[index + 1];
  if (next) {
    const travelMin = next.place && place ? travelMinutes(place, next.place, mode, rules) : 0;
    if (to + travelMin > toMinutes(next.start)) warnings.push({ code: 'OVERLAP_NEXT', travelMin, nextStart: next.start, mode });
  }

  if (place) {
    const state = openingState(placeOpeningHours(place), { date: day.date, from: start, to: end, lat: place.lat, lon: place.lon, countryCode });
    if (state === 'closed' || state === 'partial') warnings.push({ code: 'CLOSED', openingHours: placeOpeningHours(place) });
    if (place.indoor !== true && day.weatherAvailable && day.weather) {
      const rain = averageRain(day.weather, start, end);
      if (rain !== null && rain > rules.weather.rainThresholdPct) warnings.push({ code: 'RAIN', pct: Math.round(rain) });
    }
  }

  if (to > toMinutes(rules.schedule.lateEnd)) warnings.push({ code: 'LATE', lateEnd: rules.schedule.lateEnd });

  return { warnings, blocking: false, belowRecommended: durationMin >= minimumMin && durationMin < recommendedMin, durationMin };
}
