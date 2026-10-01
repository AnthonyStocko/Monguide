import { distanceKm } from './geo.js';
import { openingState } from './openingHours.js';
import { fromMinutes, toMinutes } from './time.js';

/**
 * Choix du restaurant d'un repas : pause déjeuner ou dîner (fonction pure).
 *
 * - Ouverture : les horaires OSM (opening_hours) sont évalués sur la plage du
 *   repas du jour concerné, à l'heure locale de la destination. Déjeuner :
 *   plage rules.lunchWindow (12h30-14h00, décalée à l'heure du déjeuner du
 *   pays : lunchWindowAt), une ouverture sur une partie de la plage suffit. Dîner : plage du dîner (dinnerWindow : heure du dîner du
 *   pays + durée conseillée), ouverture exigée sur toute la plage. Le pays est
 *   transmis à la librairie, qui connaît les jours fériés de chaque pays
 *   (règles "PH") : vérifié pour la France (14 juillet), l'Italie (15 août)
 *   et la Pologne (11 novembre).
 *   Fermé : exclu. Horaires absents ou illisibles : conservé, avec un malus et
 *   le badge "hours_unconfirmed".
 * - Préférences (végétarien, fauteuil roulant) : exclu si le tag vaut
 *   explicitement "no" ; information absente : malus et badge "info_missing".
 * - Score : bonus cuisine régionale, proximité des lieux "near" (déjeuner :
 *   étapes de 10h00 et 14h30 ; dîner : dernière étape du jour et hébergement
 *   du soir).
 * - Jamais deux fois le même restaurant dans le séjour (usedIds) : le dîner
 *   n'est donc jamais le restaurant du déjeuner.
 */

/** Badges posés sur l'étape du repas (traduits par l'application). */
export const RESTAURANT_BADGES = { hoursUnconfirmed: 'hours_unconfirmed', infoMissing: 'info_missing' };

/**
 * Plage du dîner : de son heure de début à début + durée conseillée.
 * @param {string} start "HH:mm"
 * @returns {{ start: string, end: string }}
 */
export function dinnerWindow(start, rules) {
  return { start, end: fromMinutes(toMinutes(start) + rules.durations.dinner.recommendedMin) };
}

/**
 * Plage du déjeuner pour une heure de déjeuner : rules.lunchWindow décalée
 * de l'écart entre cette heure et rules.dayTemplate.lunch (14:00 donne
 * 14:00-15:30). Inchangée à l'heure par défaut.
 * @param {string} start "HH:mm"
 * @returns {{ start: string, end: string }}
 */
export function lunchWindowAt(start, rules) {
  const shift = toMinutes(start) - toMinutes(rules.dayTemplate.lunch);
  const { lunchWindow: w } = rules;
  return { start: fromMinutes(toMinutes(w.start) + shift), end: fromMinutes(toMinutes(w.end) + shift) };
}

/**
 * État d'ouverture pendant la plage d'un repas.
 * @param {string | undefined} openingHours syntaxe OSM
 * @param {{ date: string, lat: number, lon: number, countryCode: string, meal?: 'lunch' | 'dinner', window?: { start: string, end: string } }} ctx
 *   window : plage du repas (déjeuner : rules.lunchWindow par défaut ; dîner : obligatoire, voir dinnerWindow)
 * @returns {'open' | 'closed' | 'unknown'}
 */
export function mealOpeningState(openingHours, { date, lat, lon, countryCode, meal = 'lunch', window }, rules) {
  const w = window ?? rules.lunchWindow;
  const state = openingState(openingHours, { date, from: w.start, to: w.end, lat, lon, countryCode });
  // Déjeuner : ouvert sur une partie de la plage suffit. Dîner : il faut toute la plage.
  if (state === 'partial') return meal === 'dinner' ? 'closed' : 'open';
  return state;
}

/**
 * État d'ouverture pendant la plage du déjeuner.
 * @param {string | undefined} openingHours syntaxe OSM
 * @param {{ date: string, lat: number, lon: number, countryCode: string }} ctx
 * @returns {'open' | 'closed' | 'unknown'}
 */
export function lunchOpeningState(openingHours, ctx, rules) {
  return mealOpeningState(openingHours, { ...ctx, meal: 'lunch' }, rules);
}

/**
 * Évaluation d'un restaurant pour un repas, sans la proximité : null s'il est
 * exclu (fermé, préférence contredite), sinon ses badges, son score de base et
 * son état d'ouverture.
 * @param {import('./model.js').Place} place
 * @param {{ date: string, countryCode: string, prefs: { vegetarian: boolean, wheelchair: boolean }, meal?: 'lunch' | 'dinner', window?: { start: string, end: string } }} ctx
 * @returns {{ badges: string[], score: number, hours: 'open' | 'unknown' } | null}
 */
export function evaluateRestaurant(place, ctx, rules) {
  if (place.category !== 'restaurant' || !place.food) return null;
  const w = rules.generation.restaurant;
  const badges = [];
  let score = w.base;

  const hours = mealOpeningState(place.food.openingHours, { date: ctx.date, lat: place.lat, lon: place.lon, countryCode: ctx.countryCode, meal: ctx.meal, window: ctx.window }, rules);
  if (hours === 'closed') return null;
  if (hours === 'unknown') {
    score -= w.hoursUnconfirmed;
    badges.push(RESTAURANT_BADGES.hoursUnconfirmed);
  }

  let missing = false;
  if (ctx.prefs.vegetarian) {
    if (place.food.vegetarian === false) return null;
    if (place.food.vegetarian === undefined) missing = true;
  }
  if (ctx.prefs.wheelchair) {
    if (place.food.wheelchair === 'no') return null;
    if (place.food.wheelchair === undefined) missing = true;
  }
  if (missing) {
    score -= w.infoMissing;
    badges.push(RESTAURANT_BADGES.infoMissing);
  }
  if (place.food.regional) score += w.regionalCuisine;
  return { badges, score, hours };
}

/**
 * @param {import('./model.js').Place[]} restaurants
 * @param {{
 *   date: string,
 *   countryCode: string,
 *   near: { lat: number, lon: number }[],
 *   effectiveRadiusKm: number,
 *   prefs: { vegetarian: boolean, wheelchair: boolean },
 *   usedIds: Set<string>,
 *   meal?: 'lunch' | 'dinner',
 *   window?: { start: string, end: string },
 *   accept?: (place: object) => boolean
 * }} ctx near = lieux dont la proximité est favorisée (voir plus haut) ; meal : "lunch" par défaut
 * @returns {{ place: import('./model.js').Place, badges: string[], score: number } | null}
 */
export function pickRestaurant(restaurants, ctx, rules) {
  const w = rules.generation.restaurant;
  let best = null;
  for (const place of restaurants) {
    if (ctx.usedIds.has(place.id)) continue;
    if (ctx.accept && !ctx.accept(place)) continue;
    const evaluated = evaluateRestaurant(place, ctx, rules);
    if (!evaluated) continue;
    let score = evaluated.score;
    if (ctx.near.length) {
      const avg = ctx.near.reduce((sum, p) => sum + distanceKm(p, place), 0) / ctx.near.length;
      score += w.proximity * Math.max(0, 1 - avg / ctx.effectiveRadiusKm);
    }
    if (!best || score > best.score) best = { place, badges: evaluated.badges, score: Math.round(score * 10) / 10 };
  }
  return best;
}

/**
 * Type de déjeuner d'un jour : "both" alterne restaurant (1er jour) et marché.
 * @param {'market' | 'restaurant' | 'both'} lunch
 * @param {number} dayIndex 0 pour le premier jour
 * @returns {'market' | 'restaurant'}
 */
export function lunchKindForDay(lunch, dayIndex) {
  if (lunch === 'both') return dayIndex % 2 === 0 ? 'restaurant' : 'market';
  return lunch;
}
