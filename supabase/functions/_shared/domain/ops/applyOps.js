import { switchToOriginal, switchToReviewed } from '../applyReview.js';
import { clearResolvedConflicts } from '../conflicts.js';
import { recomputeTravel } from '../dayEdits.js';
import { startOf } from '../stepTiming.js';
import { isValidOp, OWNER_ONLY, REJECTIONS, SINGLE_MEMBER_ONLY } from './opTypes.js';
import { summaries } from './summaries.js';

/**
 * Applique des opérations à un séjour (fonction pure, la même sur le serveur
 * — fonction trip-apply-ops, sur la dernière version — et sur l'appareil —
 * affichage immédiat, hors ligne compris). Chaque opération est appliquée ou
 * refusée seule : une étape supprimée entre-temps par un autre participant
 * donne TARGET_GONE pour l'opération qui la vise, les autres sont appliquées.
 * Après les opérations, les journées touchées ont leurs trajets recalculés et
 * leurs conflits d'horaire corrigés effacés, comme après une modification à
 * l'écran (mêmes fonctions : recomputeTravel, clearResolvedConflicts).
 *
 * @param {import('../model.js').Trip | null} trip null : séjour pas encore créé (createTrip)
 * @param {{ opId: string, type: string, params: object }[]} ops
 * @param {{ rules: any, role?: 'owner' | 'editor' | null, memberCount?: number }} context
 *   role : vérifie les droits (serveur) ; absent : pas de vérification (appareil, le serveur tranchera)
 * @returns {{ trip: import('../model.js').Trip | null, applied: string[], rejected: { opId: string | null, code: string }[], summaries: { opId: string, type: string, text: string }[], touched: string[] }}
 *   touched : identifiants des journées recalculées
 */
export function applyOps(trip, ops, { rules, role = null, memberCount = 1 } = {}) {
  let current = trip;
  const applied = [];
  const rejected = [];
  const texts = [];
  const touched = new Set();

  for (const op of ops) {
    if (!isValidOp(op)) {
      rejected.push({ opId: typeof op?.opId === 'string' ? op.opId : null, code: REJECTIONS.INVALID });
      continue;
    }
    const refusal = permission(current, op, { role, memberCount });
    if (refusal) {
      rejected.push({ opId: op.opId, code: refusal });
      continue;
    }
    const result = applyOne(current, op);
    if (result.error) {
      rejected.push({ opId: op.opId, code: result.error });
      continue;
    }
    current = result.trip;
    applied.push(op.opId);
    for (const id of result.touched ?? []) touched.add(id);
    if (result.summary) texts.push({ opId: op.opId, type: op.type, text: result.summary });
  }

  if (current && touched.size) {
    const days = current.days.map((d) => (touched.has(d.id) ? clearResolvedConflicts(recomputeTravel(d, current, rules), current.mode, rules) : d));
    current = { ...current, days };
  }
  return { trip: current, applied, rejected, summaries: texts, touched: [...touched] };
}

function permission(trip, op, { role, memberCount }) {
  if (op.type === 'createTrip') return trip ? REJECTIONS.EXISTS : null;
  if (!trip) return REJECTIONS.TARGET_GONE;
  if (trip.deleted) return REJECTIONS.TRIP_DELETED;
  if (role && role !== 'owner' && OWNER_ONLY.includes(op.type)) return REJECTIONS.FORBIDDEN;
  if (memberCount > 1 && SINGLE_MEMBER_ONLY.includes(op.type)) return REJECTIONS.SHARED_TRIP;
  return null;
}

// --- Recherche par identifiant -------------------------------------------

function locate(trip, stepId) {
  for (let d = 0; d < trip.days.length; d += 1) {
    const s = trip.days[d].steps.findIndex((x) => x.id === stepId);
    if (s >= 0) return { d, s, day: trip.days[d], step: trip.days[d].steps[s] };
  }
  return null;
}

const dayIndex = (trip, dayId) => trip.days.findIndex((d) => d.id === dayId);

const withDay = (trip, index, day) => ({ ...trip, days: trip.days.map((d, i) => (i === index ? day : d)) });

const withStep = (trip, at, step) => withDay(trip, at.d, { ...at.day, steps: at.day.steps.map((s, i) => (i === at.s ? step : s)) });

/**
 * Position d'insertion : après afterStepId s'il est dans la journée ; null :
 * en tête ; afterStepId disparu (supprimé entre-temps) : à sa place dans
 * l'ordre des heures de début.
 */
function insertionIndex(steps, step, afterStepId) {
  if (afterStepId === null || afterStepId === undefined) return 0;
  const after = steps.findIndex((s) => s.id === afterStepId);
  if (after >= 0) return after + 1;
  const later = steps.findIndex((s) => startOf(s) > startOf(step));
  return later === -1 ? steps.length : later;
}

function insertStep(day, step, afterStepId) {
  const index = insertionIndex(day.steps, step, afterStepId);
  return { ...day, steps: [...day.steps.slice(0, index), step, ...day.steps.slice(index)] };
}

const without = (object, keys) => Object.fromEntries(Object.entries(object).filter(([k]) => !keys.includes(k)));

// --- Une opération --------------------------------------------------------

/**
 * Applique une opération sans recalcul des journées (diffTrips s'en sert
 * pour simuler l'ordre des étapes).
 * @returns {{ trip: object, touched?: string[], summary?: string | null } | { error: string }}
 */
export function applyOne(trip, { type, params }) {
  return HANDLERS[type](trip, params);
}

const gone = { error: REJECTIONS.TARGET_GONE };

const HANDLERS = {
  createTrip(_trip, { trip }) {
    return { trip: { ...trip, deleted: false }, summary: summaries.createTrip() };
  },

  deleteTrip(trip) {
    return { trip: { ...trip, deleted: true }, summary: null };
  },

  renameTrip(trip, { title }) {
    const next = title.trim();
    if (next === trip.title) return { trip };
    return { trip: { ...trip, title: next }, summary: summaries.renameTrip({ title: next }) };
  },

  addStep(trip, { dayId, step, afterStepId = null }) {
    const d = dayIndex(trip, dayId);
    if (d < 0) return gone;
    if (locate(trip, step.id)) return { error: REJECTIONS.EXISTS };
    const day = trip.days[d];
    return { trip: withDay(trip, d, insertStep(day, step, afterStepId)), touched: [dayId], summary: summaries.addStep({ step, date: day.date }) };
  },

  removeStep(trip, { stepId }) {
    const at = locate(trip, stepId);
    if (!at) return gone;
    const day = { ...at.day, steps: at.day.steps.filter((s) => s.id !== stepId) };
    return { trip: withDay(trip, at.d, day), touched: [at.day.id], summary: summaries.removeStep({ step: at.step, date: at.day.date }) };
  },

  moveStep(trip, { stepId, toDayId, afterStepId = null, start, end, customTime }) {
    const at = locate(trip, stepId);
    if (!at) return gone;
    const to = dayIndex(trip, toDayId);
    if (to < 0) return gone;
    const moved = { ...at.step, start, end, ...(customTime === undefined ? {} : { customTime }) };
    const removed = withDay(trip, at.d, { ...at.day, steps: at.day.steps.filter((s) => s.id !== stepId) });
    const next = withDay(removed, to, insertStep(removed.days[to], moved, afterStepId));
    const timeChanged = start !== at.step.start || end !== at.step.end;
    return {
      trip: next,
      touched: [at.day.id, toDayId],
      summary: summaries.moveStep({ step: at.step, fromDate: at.day.date, toDate: trip.days[to].date, start, timeChanged })
    };
  },

  setStepTime(trip, { stepId, start, end, customTime }) {
    const at = locate(trip, stepId);
    if (!at) return gone;
    const step = { ...at.step, start, end, ...(customTime === undefined ? {} : { customTime }) };
    return { trip: withStep(trip, at, step), touched: [at.day.id], summary: summaries.setStepTime({ step, date: at.day.date, start, end }) };
  },

  replaceStep(trip, { stepId, place }) {
    const at = locate(trip, stepId);
    if (!at) return gone;
    const step = place ? { ...at.step, place } : without(at.step, ['place']);
    return { trip: withStep(trip, at, step), touched: [at.day.id], summary: summaries.replaceStep({ before: at.step, after: step, date: at.day.date }) };
  },

  setStepDone(trip, { stepId, status, completedAt }) {
    const at = locate(trip, stepId);
    if (!at) return gone;
    const rest = without(at.step, ['completedAt']);
    const step = status === 'planned' || !completedAt ? { ...rest, status } : { ...rest, status, completedAt };
    const summary = status === at.step.status ? null : summaries.setStepDone({ step, date: at.day.date, status });
    return { trip: withStep(trip, at, step), summary };
  },

  updateStep(trip, { stepId, set = {}, unset = [] }) {
    const at = locate(trip, stepId);
    if (!at) return gone;
    const step = { ...without(at.step, unset), ...set };
    // Historique : seulement ce que l'utilisateur voit (titre, note, intérieur/extérieur), pas les badges ou conflits recalculés.
    const visible = ['title', 'note', 'indoor'].some((k) => k in set || unset.includes(k));
    return { trip: withStep(trip, at, step), touched: [at.day.id], summary: visible ? summaries.updateStep({ step, date: at.day.date }) : null };
  },

  setDayWeather(trip, { dayId, weatherAvailable, weather }) {
    const d = dayIndex(trip, dayId);
    if (d < 0) return gone;
    const day = weather ? { ...trip.days[d], weatherAvailable, weather } : { ...without(trip.days[d], ['weather']), weatherAvailable };
    return { trip: withDay(trip, d, day) };
  },

  setDayLodging(trip, { dayId, startLodgingId, endLodgingId }) {
    const d = dayIndex(trip, dayId);
    if (d < 0) return gone;
    let day = without(trip.days[d], ['startLodgingId', 'endLodgingId']);
    if (startLodgingId) day = { ...day, startLodgingId };
    if (endLodgingId) day = { ...day, endLodgingId };
    return { trip: withDay(trip, d, day), touched: [dayId] };
  },

  setLodging(trip, { lodging }) {
    const lodgings = trip.lodgings ?? [];
    const exists = lodgings.some((l) => l.id === lodging.id);
    const next = exists ? lodgings.map((l) => (l.id === lodging.id ? lodging : l)) : [...lodgings, lodging];
    return {
      trip: { ...trip, lodgings: next },
      touched: daysUsingLodging(trip, lodging.id),
      summary: summaries.setLodging({ lodging, added: !exists })
    };
  },

  removeLodging(trip, { lodgingId }) {
    const lodging = (trip.lodgings ?? []).find((l) => l.id === lodgingId);
    if (!lodging) return gone;
    return {
      trip: { ...trip, lodgings: trip.lodgings.filter((l) => l.id !== lodgingId) },
      touched: daysUsingLodging(trip, lodgingId),
      summary: summaries.removeLodging({ lodging })
    };
  },

  updateCandidates(trip, { add = [], remove = [], update = [] }) {
    const removed = new Set(remove);
    const updates = new Map(update.map((p) => [p.id, p]));
    const kept = (trip.candidates ?? []).filter((p) => !removed.has(p.id)).map((p) => updates.get(p.id) ?? p);
    const present = new Set(kept.map((p) => p.id));
    return { trip: { ...trip, candidates: [...kept, ...add.filter((p) => !present.has(p.id))] } };
  },

  setImages(trip, { images = {}, hero, destinationWikidata }) {
    const withImage = (place) => {
      if (!place || !(place.id in images)) return place;
      const image = images[place.id];
      return image ? { ...place, image } : without(place, ['image']);
    };
    const days = trip.days.map((d) => ({ ...d, steps: d.steps.map((s) => (s.place && s.place.id in images ? { ...s, place: withImage(s.place) } : s)) }));
    let next = { ...trip, days, candidates: (trip.candidates ?? []).map(withImage) };
    if (hero !== undefined) next = hero ? { ...next, hero } : without(next, ['hero']);
    if (destinationWikidata !== undefined) next = { ...next, destination: { ...next.destination, wikidata: destinationWikidata } };
    return { trip: next };
  },

  switchReview(trip, { to }) {
    const next = to === 'original' ? switchToOriginal(trip) : switchToReviewed(trip);
    return { trip: next, summary: next === trip ? null : summaries.switchReview({ to }) };
  }
};

const daysUsingLodging = (trip, lodgingId) => trip.days.filter((d) => d.startLodgingId === lodgingId || d.endLodgingId === lodgingId).map((d) => d.id);
