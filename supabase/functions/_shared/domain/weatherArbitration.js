import { distanceKm } from './geo.js';
import { hoursCovered } from './time.js';

/** Créneaux de visite soumis à l'arbitrage météo (pas la pause déjeuner). */
const VISIT_TYPES = ['culture', 'outdoor', 'relax'];

/**
 * Probabilité de pluie moyenne sur les heures d'un créneau ; null si aucune
 * heure n'est connue.
 * @param {Record<string, number>} weather "HH" -> %
 * @param {string} start
 * @param {string} end
 */
export function averageRain(weather, start, end) {
  const values = hoursCovered(start, end).map((h) => weather[h]).filter((v) => typeof v === 'number');
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

/** Probabilités de pluie heure par heure d'un jour de prévision : { "HH": % }. */
export function dayWeather(weatherDay) {
  if (!weatherDay?.available) return undefined;
  const out = {};
  for (const h of weatherDay.hours) if (typeof h.precipitationProbability === 'number') out[h.hour.slice(0, 2)] = h.precipitationProbability;
  return out;
}

/**
 * Arbitrage météo d'une journée : chaque étape de visite en extérieur
 * (indoor false ou null) dont la pluie moyenne sur le créneau dépasse le
 * seuil (rules.weather.rainThresholdPct) est remplacée par le lieu intérieur
 * disponible le plus proche, avec le badge "weather_adapted". Les jours non
 * couverts par la prévision ne sont pas modifiés (à réévaluer plus tard).
 * Fonction pure, utilisable sans réseau avec la réserve de candidats.
 *
 * @param {{ weatherAvailable: boolean, weather?: Record<string, number>, steps: object[] }} day
 * @param {object[]} indoorCandidates lieux intérieurs (indoor true) non utilisés
 * @param {Set<string>} usedIds lieux déjà utilisés dans le séjour (mis à jour)
 * @returns {{ steps: object[], swapped: number }}
 */
export function arbitrateWeather(day, indoorCandidates, usedIds, rules) {
  if (!day.weatherAvailable || !day.weather) return { steps: day.steps, swapped: 0 };
  let swapped = 0;
  const steps = day.steps.map((step) => {
    if (!VISIT_TYPES.includes(step.type) || !step.place || step.place.indoor === true || step.locked) return step;
    const rain = averageRain(day.weather, step.start, step.end);
    if (rain === null || rain <= rules.weather.rainThresholdPct) return step;
    const replacement = indoorCandidates
      .filter((p) => p.indoor === true && !usedIds.has(p.id))
      .sort((a, b) => distanceKm(step.place, a) - distanceKm(step.place, b))[0];
    if (!replacement) return step;
    usedIds.delete(step.place.id);
    usedIds.add(replacement.id);
    swapped += 1;
    return { ...step, place: replacement, indoor: true, badges: [...new Set([...step.badges, 'weather_adapted'])] };
  });
  return { steps, swapped };
}
