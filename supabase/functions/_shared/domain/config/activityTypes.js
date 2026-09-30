import { toMinutes } from '../time.js';

/**
 * Types de lieux proposés à l'utilisateur quand il ajoute ou cherche une
 * étape, dans l'ordre d'affichage, avec les catégories de lieux (Place.category)
 * qu'ils regroupent et le type d'étape (Step.type) créé :
 *  - restaurant : déjeuner ou dîner selon l'heure (rules.activityTypes.dinnerFrom) ;
 *  - museum, monument : culture ;
 *  - nature (parc et nature), viewpoint (point de vue), small_heritage (petit patrimoine) : outdoor ;
 *  - market (marché et producteur) : déjeuner avant rules.activityTypes.marketLunchUntil, sinon culture ;
 *  - personal : étape personnelle (formulaire existant, aucune liste de lieux).
 */
export const ACTIVITY_TYPES = Object.freeze({
  restaurant: Object.freeze({ categories: Object.freeze(['restaurant']) }),
  museum: Object.freeze({ categories: Object.freeze(['museum']), stepType: 'culture' }),
  monument: Object.freeze({ categories: Object.freeze(['monument']), stepType: 'culture' }),
  nature: Object.freeze({ categories: Object.freeze(['park', 'nature']), stepType: 'outdoor' }),
  viewpoint: Object.freeze({ categories: Object.freeze(['viewpoint']), stepType: 'outdoor' }),
  market: Object.freeze({ categories: Object.freeze(['market', 'farm']) }),
  small_heritage: Object.freeze({ categories: Object.freeze(['small_heritage']), stepType: 'outdoor' }),
  personal: Object.freeze({ categories: Object.freeze([]), stepType: 'personal' })
});

/** Identifiants des types, dans l'ordre d'affichage. */
export const ACTIVITY_TYPE_IDS = Object.freeze(Object.keys(ACTIVITY_TYPES));

/**
 * Type proposé qui regroupe une catégorie de lieu, ou null (catégorie "personal").
 * @param {string} category
 * @returns {string | null}
 */
export function activityTypeOfCategory(category) {
  return ACTIVITY_TYPE_IDS.find((id) => ACTIVITY_TYPES[id].categories.includes(category)) ?? null;
}

/**
 * Type d'étape créé pour un type proposé à une heure donnée.
 * @param {string} type identifiant de ACTIVITY_TYPES
 * @param {string} time "HH:mm", heure de début choisie
 * @returns {'lunch' | 'dinner' | 'culture' | 'outdoor' | 'personal'}
 */
export function stepTypeFor(type, time, rules) {
  const t = ACTIVITY_TYPES[type];
  if (!t) throw new RangeError(`Type d'activité inconnu : ${type}`);
  if (type === 'restaurant') return toMinutes(time) < toMinutes(rules.activityTypes.dinnerFrom) ? 'lunch' : 'dinner';
  if (type === 'market') return toMinutes(time) < toMinutes(rules.activityTypes.marketLunchUntil) ? 'lunch' : 'culture';
  return /** @type {any} */ (t.stepType);
}
