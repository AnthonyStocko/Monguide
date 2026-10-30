import KNOWN_DURATIONS from '../config/durations.json' with { type: 'json' };

/**
 * Durée de visite d'un lieu (fonction pure) : durée de base de son type
 * (rules.durations : musée 1 h 30, grand musée 2 h 30, monument 45 min,
 * église 30 min, place 40 min, parc 1 h, coup d'œil 10 min…), modulée par la
 * notoriété (grand musée au-delà de durationRules.bigMuseumScore, monument
 * très connu : durationRules.famousBonusMin de plus), remplacée par la durée
 * connue des lieux célèbres (config/durations.json), puis multipliée par le
 * coefficient du rythme du séjour (durationRules.pace ; jamais pour un coup
 * d'œil ni un repas). Durée maximale (compaction des journées) : conseillée
 * × durationRules.maxFactor.
 */

const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

const CASTLE = /(^|[^a-z])(chateau|castle|castell|castillo|castelo|castello|schloss|burg|zamek|hrad|kasteel|palais|palace|palacio|palazzo)([^a-z]|$)/;
const TRAIL = /(^|[^a-z])(sentier|randonnee|trail|hiking|chemin de grande randonnee)([^a-z]|$)/;
const CHURCH =
  /(^|[^a-z])(eglise|church|kerk|iglesia|esglesia|kirche|chiesa|chapelle|chapel|kapel|capella|basilique|basilica|basiliek|cathedrale|cathedral|kathedraal|catedral|primatiale|collegiale|abbatiale)([^a-z]|$)/;
const SQUARE = /^(grand-place|grand place|grote markt|place|plaza|placa|piazza|plein|platz|square)([^a-z]|$)/;

/** Durées connues, identifiants Q seulement. */
const KNOWN = Object.fromEntries(Object.entries(KNOWN_DURATIONS).filter(([k, v]) => /^Q\d+$/.test(k) && Number.isFinite(v) && v > 0));

/**
 * Type d'activité d'un lieu (clé de rules.durations, sauf bigMuseum, décidé
 * par placeDuration). place.kind (« church », « square », « castle »,
 * d'après les natures Wikidata, scoring/exclusions.js) l'emporte sur le nom.
 * @param {{ category: string, name?: string, glance?: boolean, kind?: string }} place
 * @returns {'museum' | 'castle' | 'church' | 'square' | 'monument' | 'smallHeritage' | 'park' | 'trail' | 'market' | 'restaurant' | 'glance'}
 */
export function activityType(place) {
  if (place.glance === true) return 'glance';
  const name = normalize(place.name);
  switch (place.category) {
    case 'museum':
      return 'museum';
    case 'monument':
      if (place.kind === 'church' || place.kind === 'square' || place.kind === 'castle') return place.kind;
      if (CHURCH.test(name)) return 'church';
      if (CASTLE.test(name)) return 'castle';
      if (SQUARE.test(name)) return 'square';
      return 'monument';
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

const round5 = (n) => Math.max(5, Math.round(n / 5) * 5);

/**
 * @param {{ category: string, name?: string, glance?: boolean, kind?: string, notoriety?: number, wikidata?: string, event?: { durationMin?: number } }} place
 * @param {any} rules
 * @param {{ pace?: 'relaxed' | 'balanced' | 'intense' }} [options] rythme du séjour (Trip.pace)
 * @returns {{ recommendedMin: number, minimumMin: number, maximumMin: number }}
 */
export function placeDuration(place, rules, { pace = 'balanced' } = {}) {
  const dr = rules.durationRules;
  const type = activityType(place);
  const notoriety = place.notoriety ?? 0;
  const base = type === 'museum' && notoriety >= dr.bigMuseumScore ? rules.durations.bigMuseum : rules.durations[type];
  let recommended = base.recommendedMin;
  // Événement de saison : sa durée saisie ; lieu célèbre : sa durée connue.
  const known = place.event?.durationMin ?? (type !== 'glance' && place.wikidata ? KNOWN[place.wikidata] : undefined);
  if (known) recommended = known;
  else if (['monument', 'church', 'square', 'castle'].includes(type) && notoriety >= dr.famousScore) recommended += dr.famousBonusMin;
  const factor = type === 'glance' || type === 'restaurant' ? 1 : (dr.pace[pace] ?? 1);
  recommended = round5(recommended * factor);
  return {
    recommendedMin: recommended,
    minimumMin: Math.min(base.minimumMin, recommended),
    maximumMin: type === 'glance' ? Math.max(recommended, 15) : round5(recommended * dr.maxFactor)
  };
}
