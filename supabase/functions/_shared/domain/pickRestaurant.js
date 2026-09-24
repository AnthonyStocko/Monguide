import { distanceKm } from './geo.js';
import { openingState } from './openingHours.js';

/**
 * Choix du restaurant d'une pause déjeuner (fonction pure).
 *
 * - Ouverture : les horaires OSM (opening_hours) sont évalués sur la plage du
 *   déjeuner (rules.lunchWindow, 12h30-14h00) du jour concerné, à l'heure
 *   locale de la destination. Le pays est transmis à la librairie, qui connaît
 *   les jours fériés de chaque pays (règles "PH") : vérifié pour la France
 *   (14 juillet), l'Italie (15 août) et la Pologne (11 novembre).
 *   Fermé : exclu. Horaires absents ou illisibles : conservé, avec un malus et
 *   le badge "hours_unconfirmed".
 * - Préférences (végétarien, fauteuil roulant) : exclu si le tag vaut
 *   explicitement "no" ; information absente : malus et badge "info_missing".
 * - Score : bonus cuisine régionale, proximité des étapes de 10h00 et 14h30.
 * - Jamais deux fois le même restaurant dans le séjour (usedIds).
 */

/** Badges posés sur l'étape du déjeuner (traduits par l'application). */
export const RESTAURANT_BADGES = { hoursUnconfirmed: 'hours_unconfirmed', infoMissing: 'info_missing' };

/**
 * État d'ouverture pendant la plage du déjeuner.
 * @param {string | undefined} openingHours syntaxe OSM
 * @param {{ date: string, lat: number, lon: number, countryCode: string }} ctx
 * @returns {'open' | 'closed' | 'unknown'}
 */
export function lunchOpeningState(openingHours, { date, lat, lon, countryCode }, rules) {
  const state = openingState(openingHours, { date, from: rules.lunchWindow.start, to: rules.lunchWindow.end, lat, lon, countryCode });
  // Ouvert sur une partie de la plage du déjeuner : suffisant pour déjeuner.
  return state === 'partial' ? 'open' : state;
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
 *   accept?: (place: object) => boolean
 * }} ctx near = étapes de 10h00 et 14h30 du jour (ou le point d'ancrage)
 * @returns {{ place: import('./model.js').Place, badges: string[], score: number } | null}
 */
export function pickRestaurant(restaurants, ctx, rules) {
  const w = rules.generation.restaurant;
  let best = null;
  for (const place of restaurants) {
    if (place.category !== 'restaurant' || !place.food || ctx.usedIds.has(place.id)) continue;
    if (ctx.accept && !ctx.accept(place)) continue;
    const badges = [];
    let score = w.base;

    const state = lunchOpeningState(place.food.openingHours, { date: ctx.date, lat: place.lat, lon: place.lon, countryCode: ctx.countryCode }, rules);
    if (state === 'closed') continue;
    if (state === 'unknown') {
      score -= w.hoursUnconfirmed;
      badges.push(RESTAURANT_BADGES.hoursUnconfirmed);
    }

    let missing = false;
    if (ctx.prefs.vegetarian) {
      if (place.food.vegetarian === false) continue;
      if (place.food.vegetarian === undefined) missing = true;
    }
    if (ctx.prefs.wheelchair) {
      if (place.food.wheelchair === 'no') continue;
      if (place.food.wheelchair === undefined) missing = true;
    }
    if (missing) {
      score -= w.infoMissing;
      badges.push(RESTAURANT_BADGES.infoMissing);
    }

    if (place.food.regional) score += w.regionalCuisine;
    if (ctx.near.length) {
      const avg = ctx.near.reduce((sum, p) => sum + distanceKm(p, place), 0) / ctx.near.length;
      score += w.proximity * Math.max(0, 1 - avg / ctx.effectiveRadiusKm);
    }
    if (!best || score > best.score) best = { place, badges, score: Math.round(score * 10) / 10 };
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
