/**
 * Type d'activité d'un lieu (scoring/duration.js), durées, et catégories de lieux
 * acceptées par chaque créneau du gabarit de journée et chaque profil.
 */

import { activityType, placeDuration } from './scoring/duration.js';

export { activityType };

/**
 * Durées { recommendedMin, minimumMin, maximumMin } d'un lieu
 * (scoring/duration.js), ou d'un temps libre de détente. rules.tripPace :
 * rythme du séjour (Trip.pace), ajouté aux règles par la génération ; à
 * défaut, rythme équilibré.
 */
export function durationsFor(place, rules) {
  if (!place) return { ...rules.durations.relax, maximumMin: Math.round(rules.durations.relax.recommendedMin * rules.durationRules.maxFactor) };
  return placeDuration(place, rules, { pace: rules.tripPace });
}

/**
 * Durées d'une étape : celles du dîner pour un dîner (restaurant ou soirée
 * libre), sinon celles de son lieu (durationsFor).
 * @param {{ type: string, place?: object }} step
 */
export function stepDurations(step, rules) {
  return step.type === 'dinner' ? rules.durations.dinner : durationsFor(step.place, rules);
}

/**
 * Seuils horaires d'une étape (rules.schedule) : ceux du dîner, ou ceux des
 * activités pour tout autre type d'étape.
 * @param {{ type: string }} step
 * @returns {{ latestStart: string, lateEnd: string }} "HH:mm"
 */
export function scheduleLimits(step, rules) {
  const kind = step.type === 'dinner' ? 'dinner' : 'activity';
  return { latestStart: rules.schedule.latestStart[kind], lateEnd: rules.schedule.lateEnd[kind] };
}

/**
 * Catégories de lieux autorisées par profil pour les visites (hors déjeuner).
 *  - certified : patrimoine certifié uniquement ;
 *  - balanced : + parcs, espaces naturels, marchés, et lieux connus (place.notable :
 *    notoriété d'au moins rules.notoriety.notableScore, sans label officiel) ;
 *  - explorer : tout, y compris petit patrimoine et points de vue.
 */
export function allowedByProfile(place, profile) {
  if (place.category === 'restaurant') return false;
  if (profile === 'certified') return place.certified === true;
  if (profile === 'balanced') return place.certified === true || place.notable === true || ['park', 'nature', 'market', 'farm'].includes(place.category);
  return true;
}

/**
 * Le lieu convient-il au créneau ?
 *  - culture (10h00) : musées, monuments, petit patrimoine ;
 *  - outdoor (14h30) : parcs, nature, points de vue, petit patrimoine, monuments extérieurs ;
 *  - relax (17h30) : parcs, points de vue, nature.
 * @param {'culture' | 'outdoor' | 'relax'} slot
 */
export function fitsSlot(place, slot) {
  const c = place.category;
  if (slot === 'culture') return c === 'museum' || c === 'monument' || c === 'small_heritage';
  if (slot === 'outdoor') return ['park', 'nature', 'viewpoint', 'small_heritage'].includes(c) || (c === 'monument' && place.indoor !== true);
  if (slot === 'relax') return ['park', 'viewpoint', 'nature'].includes(c);
  return false;
}

/** Lieu du déjeuner "marché et producteurs". */
export const isMarket = (place) => place.category === 'market' || place.category === 'farm';
