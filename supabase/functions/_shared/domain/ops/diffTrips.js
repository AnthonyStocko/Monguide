import { switchToOriginal, switchToReviewed } from '../applyReview.js';
import { applyOne } from './applyOps.js';
import { DERIVED_DAY_FIELDS, DERIVED_STEP_FIELDS, UPDATABLE_STEP_FIELDS } from './opTypes.js';

/**
 * Opérations qui transforment `before` en `after` : chaque action de l'écran
 * calcule toujours le séjour suivant avec les fonctions du domaine (replanDay,
 * applyChanges, replaceStepPlace…), puis l'appareil n'envoie que ces
 * opérations, désignées par identifiant. Propriété vérifiée par les tests :
 * applyOps(before, diffTrips(before, after).ops) redonne after (trajets
 * recalculés compris).
 *
 * Champs recalculés (trajets, départ, retour) : jamais envoyés, recalculés
 * par applyOps sur la version du serveur.
 *
 * @param {import('../model.js').Trip} before séjour affiché quand l'action a été faite
 * @param {import('../model.js').Trip} after séjour après l'action
 * @param {{ makeId?: () => string }} [options]
 * @returns {{ ops: { opId: string, type: string, params: object }[], unsupported: string[] }}
 *   unsupported : changements sans opération (jamais attendus ; signalés en développement)
 */
export function diffTrips(before, after, { makeId = () => crypto.randomUUID() } = {}) {
  const ops = [];
  const unsupported = [];
  let sim = before;
  const emit = (type, params) => {
    const op = { opId: makeId(), type, params };
    const result = applyOne(sim, op);
    if (result.error) throw new Error(`diffTrips: ${type} ${result.error}`);
    sim = result.trip;
    ops.push(op);
  };

  if (after.deleted && !before.deleted) return { ops: [{ opId: makeId(), type: 'deleteTrip', params: {} }], unsupported };
  if (after.title !== before.title) emit('renameTrip', { title: after.title });

  // Relecture IA : bascule entre version d'origine et version relue (journées et réserve remplacées en bloc).
  if (!same(before.review, after.review)) {
    const from = before.review?.status;
    const to = after.review?.status;
    const switched = from === 'applied' && to === 'reverted' ? switchToOriginal(before) : from === 'reverted' && to === 'applied' ? switchToReviewed(before) : null;
    if (switched && same(switched.review, after.review)) emit('switchReview', { to: to === 'reverted' ? 'original' : 'reviewed' });
    else unsupported.push('review');
  }

  diffLodgings(sim, after, emit);
  diffImages(sim, after, emit);
  diffDays(() => sim, after, emit, unsupported);
  diffCandidates(sim, after, emit);

  for (const key of new Set([...Object.keys(sim), ...Object.keys(after)])) {
    if (IGNORED_TRIP_KEYS.has(key)) continue;
    if (key === 'destination') {
      if (!same(without(sim.destination, ['wikidata']), without(after.destination, ['wikidata']))) unsupported.push('destination');
    } else if (!same(sim[key], after[key])) unsupported.push(key);
  }
  return { ops, unsupported };
}

const IGNORED_TRIP_KEYS = new Set(['id', 'title', 'days', 'lodgings', 'candidates', 'review', 'hero', 'updatedAt', 'createdAt', 'version', 'deleted']);

function diffLodgings(base, after, emit) {
  const next = after.lodgings ?? [];
  for (const lodging of next) {
    const old = (base.lodgings ?? []).find((l) => l.id === lodging.id);
    if (!old || !same(old, lodging)) emit('setLodging', { lodging });
  }
  for (const old of base.lodgings ?? []) if (!next.some((l) => l.id === old.id)) emit('removeLodging', { lodgingId: old.id });
}

/** Photos (setImages) : même lieu (même identifiant), seule la photo change. */
function diffImages(base, after, emit) {
  const images = {};
  const visit = (a, b) => {
    if (!a || !b || a.id !== b.id || same(a.image, b.image)) return;
    if (same(without(a, ['image']), without(b, ['image']))) images[b.id] = b.image ?? null;
  };
  const beforeSteps = new Map(base.days.flatMap((d) => d.steps).map((s) => [s.id, s]));
  for (const s of after.days.flatMap((d) => d.steps)) visit(beforeSteps.get(s.id)?.place, s.place);
  const beforeCandidates = new Map((base.candidates ?? []).map((p) => [p.id, p]));
  for (const p of after.candidates ?? []) visit(beforeCandidates.get(p.id), p);

  const params = {};
  if (Object.keys(images).length) params.images = images;
  if (!same(base.hero, after.hero)) params.hero = after.hero ?? null;
  if ((base.destination?.wikidata ?? undefined) !== (after.destination?.wikidata ?? undefined) && after.destination?.wikidata !== undefined) {
    params.destinationWikidata = after.destination.wikidata;
  }
  if (Object.keys(params).length) emit('setImages', params);
}

function diffDays(getSim, after, emit, unsupported) {
  const sim = getSim();
  if (sim.days.length !== after.days.length || sim.days.some((d, i) => d.id !== after.days[i].id || d.date !== after.days[i].date)) {
    unsupported.push('days');
    return;
  }

  // Journées : météo, hébergements ; autres champs non modifiables.
  after.days.forEach((day, i) => {
    const old = getSim().days[i];
    if (old.weatherAvailable !== day.weatherAvailable || !same(old.weather, day.weather)) {
      emit('setDayWeather', { dayId: day.id, weatherAvailable: day.weatherAvailable, weather: day.weather ?? null });
    }
    if ((old.startLodgingId ?? null) !== (day.startLodgingId ?? null) || (old.endLodgingId ?? null) !== (day.endLodgingId ?? null)) {
      emit('setDayLodging', { dayId: day.id, startLodgingId: day.startLodgingId ?? null, endLodgingId: day.endLodgingId ?? null });
    }
    const ignored = ['steps', 'weather', 'weatherAvailable', 'startLodgingId', 'endLodgingId', ...DERIVED_DAY_FIELDS];
    if (!same(without(old, ignored), without(day, ignored))) unsupported.push(`day:${day.date}`);
  });

  // Étapes supprimées, puis, journée par journée et dans l'ordre : ajoutées, déplacées, modifiées.
  const kept = new Set(after.days.flatMap((d) => d.steps.map((s) => s.id)));
  for (const s of getSim().days.flatMap((d) => d.steps)) if (!kept.has(s.id)) emit('removeStep', { stepId: s.id });

  for (const day of after.days) {
    day.steps.forEach((step, i) => {
      const afterStepId = i > 0 ? day.steps[i - 1].id : null;
      const at = find(getSim(), step.id);
      if (!at) {
        emit('addStep', { dayId: day.id, step: without(step, DERIVED_STEP_FIELDS), afterStepId });
        return;
      }
      const previous = at.index > 0 ? at.day.steps[at.index - 1].id : null;
      const customTime = step.customTime !== at.step.customTime ? { customTime: step.customTime } : {};
      if (at.day.id !== day.id || previous !== afterStepId) {
        emit('moveStep', { stepId: step.id, toDayId: day.id, afterStepId, start: step.start, end: step.end, ...customTime });
      } else if (at.step.start !== step.start || at.step.end !== step.end) {
        emit('setStepTime', { stepId: step.id, start: step.start, end: step.end, ...customTime });
      }
      diffStep(find(getSim(), step.id).step, step, emit);
    });
  }
}

function diffStep(old, step, emit) {
  if (!same(old.place, step.place)) emit('replaceStep', { stepId: step.id, place: step.place ?? null });
  if (old.status !== step.status || (old.completedAt ?? null) !== (step.completedAt ?? null)) {
    emit('setStepDone', { stepId: step.id, status: step.status, ...(step.completedAt ? { completedAt: step.completedAt } : {}) });
  }
  const set = {};
  const unset = [];
  for (const key of UPDATABLE_STEP_FIELDS) {
    if (same(old[key], step[key])) continue;
    if (step[key] === undefined) unset.push(key);
    else set[key] = step[key];
  }
  if (Object.keys(set).length || unset.length) emit('updateStep', { stepId: step.id, ...(Object.keys(set).length ? { set } : {}), ...(unset.length ? { unset } : {}) });
}

/** Réserve de lieux : retraits, mises à jour et ajouts ; si l'ordre ne suit pas, réserve renvoyée entière. */
function diffCandidates(base, after, emit) {
  const before = base.candidates ?? [];
  const next = after.candidates ?? [];
  if (same(before, next)) return;
  const nextIds = new Set(next.map((p) => p.id));
  const beforeById = new Map(before.map((p) => [p.id, p]));
  const remove = before.filter((p) => !nextIds.has(p.id)).map((p) => p.id);
  const update = next.filter((p) => beforeById.has(p.id) && !same(beforeById.get(p.id), p));
  const add = next.filter((p) => !beforeById.has(p.id));
  const kept = next.filter((p) => beforeById.has(p.id)).map((p) => p.id);
  const keptInOrder = before.filter((p) => nextIds.has(p.id)).map((p) => p.id);
  const inOrder = same(kept, keptInOrder) && same(next.map((p) => p.id), [...kept, ...add.map((p) => p.id)]);
  if (inOrder) {
    emit('updateCandidates', { ...(add.length ? { add } : {}), ...(remove.length ? { remove } : {}), ...(update.length ? { update } : {}) });
  } else {
    emit('updateCandidates', { remove: before.map((p) => p.id), add: next });
  }
}

function find(trip, stepId) {
  for (const day of trip.days) {
    const index = day.steps.findIndex((s) => s.id === stepId);
    if (index >= 0) return { day, index, step: day.steps[index] };
  }
  return null;
}

const without = (object, keys) => (object ? Object.fromEntries(Object.entries(object).filter(([k]) => !keys.includes(k))) : object);

/** Égalité de valeurs JSON ; une clé absente vaut une clé à undefined. */
export function same(a, b) {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b || (a === undefined && b === undefined);
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) return a.length === b.length && a.every((v, i) => same(v, b[i]));
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!same(a[k], b[k])) return false;
  return true;
}
