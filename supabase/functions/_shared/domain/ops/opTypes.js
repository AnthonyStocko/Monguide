import { STEP_STATUSES } from '../model.js';

/**
 * Opérations de modification d'un séjour (Prompt 8.0, Bloc B). Une opération
 * = { opId (uuid créé par l'appareil), type, params } ; elle désigne les
 * journées et les étapes par leur identifiant stable, jamais par leur
 * position. Appliquées par applyOps (serveur et appareil), produites par
 * diffTrips à partir de l'action faite à l'écran.
 */
export const OP_TYPES = Object.freeze([
  'createTrip',
  'deleteTrip',
  'renameTrip',
  'addStep',
  'removeStep',
  'moveStep',
  'setStepTime',
  'replaceStep',
  'setStepDone',
  'updateStep',
  'setDayWeather',
  'setDayLodging',
  'setLodging',
  'removeLodging',
  'updateCandidates',
  'setImages',
  'switchReview'
]);

/** Réservées à l'owner du séjour. */
export const OWNER_ONLY = Object.freeze(['deleteTrip', 'renameTrip']);

/** Interdites dès que le séjour a plus d'un participant (décision du Bloc 0). */
export const SINGLE_MEMBER_ONLY = Object.freeze(['switchReview']);

/** Opérations par appel de trip-apply-ops. */
export const MAX_OPS_PER_CALL = 50;

/**
 * Codes de refus d'une opération (les autres opérations du lot sont appliquées).
 * TARGET_GONE : étape, journée ou hébergement supprimé entre-temps.
 */
export const REJECTIONS = Object.freeze({
  TARGET_GONE: 'TARGET_GONE',
  FORBIDDEN: 'FORBIDDEN',
  SHARED_TRIP: 'SHARED_TRIP',
  EXISTS: 'EXISTS',
  TRIP_DELETED: 'TRIP_DELETED',
  INVALID: 'INVALID'
});

/**
 * Champs d'une étape modifiables par updateStep. Les autres ont leur propre
 * opération (horaire, lieu, statut) ou sont recalculés (trajet).
 */
export const UPDATABLE_STEP_FIELDS = Object.freeze(['type', 'title', 'note', 'indoor', 'badges', 'conflicts', 'customTime', 'locked', 'specialties', 'category', 'source']);

/** Champs d'une étape recalculés après chaque modification de sa journée (recomputeTravel). */
export const DERIVED_STEP_FIELDS = Object.freeze(['travelFromPreviousMin']);

/** Champs d'une journée recalculés après chaque modification (recomputeTravel). */
export const DERIVED_DAY_FIELDS = Object.freeze(['departure', 'returnTravelMin']);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const isObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const isId = (v) => typeof v === 'string' && v.length > 0 && v.length <= 200;
const isIdOrNull = (v) => v === null || isId(v);
const isText = (v, max) => typeof v === 'string' && v.trim() !== '' && v.length <= max;
// Lieu : forme minimale seulement (un lieu enregistré par une ancienne version doit rester accepté).
const isPlace = (p) => isObject(p) && isId(p.id) && typeof p.name === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lon);
const isStep = (s) => isObject(s) && isId(s.id) && typeof s.type === 'string' && TIME.test(s.start) && TIME.test(s.end) && (s.place === undefined || isPlace(s.place));
const isLodging = (l) => isObject(l) && isId(l.id) && typeof l.address === 'string' && Number.isFinite(l.lat) && Number.isFinite(l.lon) && Array.isArray(l.nights);

/** Vérification des paramètres, par type (forme seulement ; l'existence des cibles est vérifiée à l'application). */
const PARAMS = {
  createTrip: (p) => isObject(p.trip) && isId(p.trip.id) && Array.isArray(p.trip.days) && isObject(p.trip.destination),
  deleteTrip: () => true,
  renameTrip: (p) => isText(p.title, 100),
  addStep: (p) => isId(p.dayId) && isStep(p.step) && isIdOrNull(p.afterStepId ?? null),
  removeStep: (p) => isId(p.stepId),
  moveStep: (p) => isId(p.stepId) && isId(p.toDayId) && isIdOrNull(p.afterStepId ?? null) && p.afterStepId !== p.stepId && TIME.test(p.start) && TIME.test(p.end) && (p.customTime === undefined || typeof p.customTime === 'boolean'),
  setStepTime: (p) => isId(p.stepId) && TIME.test(p.start) && TIME.test(p.end) && (p.customTime === undefined || typeof p.customTime === 'boolean'),
  replaceStep: (p) => isId(p.stepId) && (p.place === null || isPlace(p.place)),
  setStepDone: (p) => isId(p.stepId) && STEP_STATUSES.includes(p.status) && (p.completedAt === undefined || p.completedAt === null || TIME.test(p.completedAt)),
  updateStep: (p) =>
    isId(p.stepId) &&
    isObject(p.set ?? {}) &&
    Array.isArray(p.unset ?? []) &&
    [...Object.keys(p.set ?? {}), ...(p.unset ?? [])].every((k) => UPDATABLE_STEP_FIELDS.includes(k)) &&
    (p.set?.title === undefined || (typeof p.set.title === 'string' && p.set.title.length <= 60)) &&
    (p.set?.note === undefined || (typeof p.set.note === 'string' && p.set.note.length <= 500)),
  setDayWeather: (p) => isId(p.dayId) && typeof p.weatherAvailable === 'boolean' && (p.weather === null || isObject(p.weather)),
  setDayLodging: (p) => isId(p.dayId) && isIdOrNull(p.startLodgingId) && isIdOrNull(p.endLodgingId),
  setLodging: (p) => isLodging(p.lodging),
  removeLodging: (p) => isId(p.lodgingId),
  updateCandidates: (p) =>
    (p.add ?? []).every?.(isPlace) && (p.update ?? []).every?.(isPlace) && (p.remove ?? []).every?.(isId) && [p.add, p.update, p.remove].every((v) => v === undefined || Array.isArray(v)),
  setImages: (p) =>
    isObject(p.images ?? {}) &&
    (p.hero === undefined || p.hero === null || isObject(p.hero)) &&
    (p.destinationWikidata === undefined || p.destinationWikidata === null || /^Q\d+$/.test(p.destinationWikidata)),
  switchReview: (p) => p.to === 'original' || p.to === 'reviewed'
};

/**
 * @param {unknown} op
 * @returns {boolean} forme valide (identifiant, type connu, paramètres)
 */
export function isValidOp(op) {
  if (!isObject(op) || typeof op.opId !== 'string' || !UUID.test(op.opId)) return false;
  if (!OP_TYPES.includes(op.type) || !isObject(op.params)) return false;
  try {
    return Boolean(PARAMS[op.type](op.params));
  } catch {
    return false;
  }
}
