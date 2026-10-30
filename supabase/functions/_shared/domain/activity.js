/**
 * Type d'activité d'un lieu (clé de rules.durations) et catégories de lieux
 * acceptées par chaque créneau du gabarit de journée et chaque profil.
 */

const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const CASTLE = /(^|[^a-z])(chateau|castle|castell|castillo|castelo|castello|schloss|burg|zamek|hrad|kasteel|palais|palace|palacio|palazzo)([^a-z]|$)/;
const TRAIL = /(^|[^a-z])(sentier|randonnee|trail|hiking|chemin de grande randonnee)([^a-z]|$)/;

/**
 * Coup d'œil (place.glance : statue, fontaine, façade vue en passant,
 * scoring/exclusions.js) : durée courte, quelle que soit la catégorie.
 * @param {{ category: string, name?: string, glance?: boolean }} place
 * @returns {'museum' | 'castle' | 'monument' | 'smallHeritage' | 'park' | 'trail' | 'market' | 'restaurant' | 'glance'}
 */
export function activityType(place) {
  if (place.glance === true) return 'glance';
  const name = normalize(place.name);
  switch (place.category) {
    case 'museum':
      return 'museum';
    case 'monument':
      return CASTLE.test(name) ? 'castle' : 'monument';
    case 'small_heritage':
    case 'viewpoint':
      return 'smallHeritage';
    case 'park':
    case 'nature':
      return TRAIL.test(name) ? 'trail' : 'park';
    case 'market':
    case 'farm':
      return 'market';
    case 'restaurant':
      return 'restaurant';
    default:
      return 'monument';
  }
}

/** Durées { recommendedMin, minimumMin } d'un lieu (ou d'un temps libre de détente). */
export function durationsFor(place, rules) {
  return rules.durations[place ? activityType(place) : 'relax'];
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
