import { distanceKm } from './geo.js';
import { openingState, placeOpeningHours, usuallyClosed } from './openingHours.js';
import { averageRain } from './weatherArbitration.js';

/**
 * Incontournables d'un séjour (fonctions pures, generateTrip.js) : les lieux
 * les plus connus près du logement, placés en priorité et répartis sur les
 * jours selon leurs horaires et la météo. Paramètres :
 * rules.notoriety.mustSee.
 */

/** Plage de visite utilisée pour savoir si un lieu ouvre un jour donné. */
const VISIT_HOURS = { from: '09:00', to: '19:00' };
/** Heures de la journée dont la pluie compte pour placer un lieu en plein air. */
const DAYTIME = { start: '10:00', end: '18:00' };

/**
 * Le lieu ouvre-t-il ce jour-là ? Horaires inconnus : oui, sauf pour un musée
 * un jour de fermeture habituel du pays (usuallyClosed).
 * @param {import('./model.js').Place} place
 * @param {string} date
 * @param {string} countryCode
 */
export function openOn(place, date, countryCode) {
  if (usuallyClosed(place, date, countryCode)) return false;
  return openingState(placeOpeningHours(place), { date, ...VISIT_HOURS, lat: place.lat, lon: place.lon, countryCode }) !== 'closed';
}

/**
 * Incontournables : les lieux de notoriété d'au moins mustSee.minScore à
 * moins de radiusKm d'un point d'ancrage (logements, sinon destination),
 * ouverts au moins un jour du séjour, les plus connus d'abord ; jours ×
 * perDay lieux, entre min et max. Un lieu fermé pendant tout le séjour n'en
 * fait pas partie.
 * @param {import('./model.js').Place[]} pool visites possibles (profil, seuil de notoriété)
 * @param {{ anchors: { lat: number, lon: number }[], radiusKm: number, dates: string[], countryCode: string }} ctx
 * @returns {import('./model.js').Place[]}
 */
export function selectMustSees(pool, { anchors, radiusKm, dates, countryCode }, rules) {
  const { min, max, perDay, minScore } = rules.notoriety.mustSee;
  const count = Math.min(max, Math.max(min, dates.length * perDay));
  return pool
    .filter((p) => (p.notoriety ?? 0) >= minScore)
    .filter((p) => anchors.some((a) => distanceKm(a, p) <= radiusKm))
    .filter((p) => dates.some((d) => openOn(p, d, countryCode)))
    .sort((a, b) => (b.notoriety ?? 0) - (a.notoriety ?? 0) || a.id.localeCompare(b.id))
    .slice(0, count);
}

/**
 * Répartition des incontournables sur les jours, du plus connu au moins
 * connu. Pour chacun, parmi les jours où il est ouvert et qui ont encore de
 * la place (maxVisitsPerDay visites, maxGlancesPerDay coups d'œil) : le jour
 * le moins chargé, puis, pour un lieu en plein air, un jour sans pluie
 * annoncée (au-delà de rules.weather.rainThresholdPct en journée), puis le
 * jour dont les incontournables déjà placés sont les plus proches.
 * @param {import('./model.js').Place[]} mustSees
 * @param {{ dates: string[], weather: (Record<string, number> | undefined)[], countryCode: string }} ctx
 *   weather : pluie heure par heure de chaque jour (Day.weather), absente si inconnue
 * @returns {{ days: import('./model.js').Place[][], unplaced: import('./model.js').Place[] }}
 */
export function planMustSees(mustSees, { dates, weather, countryCode }, rules) {
  const { maxVisitsPerDay, maxGlancesPerDay } = rules.notoriety.mustSee;
  const days = dates.map(() => []);
  const unplaced = [];
  const rainy = dates.map((_, i) => {
    const rain = weather[i] ? averageRain(weather[i], DAYTIME.start, DAYTIME.end) : null;
    return rain !== null && rain > rules.weather.rainThresholdPct;
  });
  for (const place of mustSees) {
    const glance = place.glance === true;
    const load = (i) => days[i].filter((p) => (p.glance === true) === glance).length;
    const room = glance ? maxGlancesPerDay : maxVisitsPerDay;
    const nearest = (i) => (days[i].length ? Math.min(...days[i].map((p) => distanceKm(p, place))) : 0);
    const options = dates
      .map((date, i) => i)
      .filter((i) => load(i) < room && openOn(place, dates[i], countryCode))
      .sort((a, b) => load(a) - load(b) || weatherPenalty(place, rainy[a]) - weatherPenalty(place, rainy[b]) || nearest(a) - nearest(b) || a - b);
    if (options.length) days[options[0]].push(place);
    else unplaced.push(place);
  }
  return { days, unplaced };
}

/** Lieu en plein air un jour de pluie : 1 ; sinon 0. */
const weatherPenalty = (place, rainy) => (rainy && place.indoor !== true ? 1 : 0);
