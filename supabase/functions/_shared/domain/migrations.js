import { SCHEMA_VERSION } from './model.js';
import { dayId, stepId } from './stableId.js';

/**
 * Migrations du schéma des séjours. migrate() met à niveau un séjour de
 * n'importe quelle version antérieure vers la version courante ; elle est
 * appelée à chaque lecture depuis IndexedDB et à chaque réception par la
 * synchronisation. Un séjour d'une version plus récente que l'application
 * est rendu en lecture seule ("Mettez à jour l'application pour modifier ce
 * séjour").
 *
 * Pour une nouvelle version N : ajouter MIGRATIONS[N - 1] = (trip) => trip
 * transformé (sans modifier l'objet reçu), puis incrémenter SCHEMA_VERSION.
 */
export const MIGRATIONS = Object.freeze({
  // Version 1 -> 2 : dîner. Un séjour existant n'a aucune étape de dîner ; il
  // devient "libre" (aucune proposition), sans toucher à ses journées.
  1: (trip) => ({ ...trip, dinner: trip.dinner ?? 'free' }),
  // Version 2 -> 3 : séjours partagés. Chaque journée (et chaque étape qui n'en
  // a pas) reçoit un identifiant stable, déterministe (stableId.js) : le même
  // que celui de la migration SQL, et le même à chaque lecture tant que le
  // séjour migré n'est pas enregistré. Les versions d'origine et relue de la
  // relecture IA sont migrées aussi (même journée, même identifiant).
  2: (trip) => {
    const withIds = (days) => (Array.isArray(days) ? days.map((d) => withDayIds(trip.id, d)) : days);
    const review = trip.review && { ...trip.review, originalDays: withIds(trip.review.originalDays), reviewedDays: withIds(trip.review.reviewedDays) };
    return { ...trip, days: withIds(trip.days ?? []), ...(review ? { review } : {}) };
  }
});

function withDayIds(tripId, day) {
  const steps = day.steps ?? [];
  if (day.id && day.steps && steps.every((s) => s.id)) return day;
  return { ...day, id: day.id || dayId(tripId, day.date), steps: steps.map((s, i) => (s.id ? s : { ...s, id: stepId(tripId, day.date, i) })) };
}

/**
 * @param {object} trip
 * @param {number} [current] version courante (tests)
 * @returns {{ trip: object, readOnly: boolean }}
 */
export function migrate(trip, current = SCHEMA_VERSION, migrations = MIGRATIONS) {
  const version = Number.isInteger(trip?.schemaVersion) ? trip.schemaVersion : 1;
  if (version > current) return { trip, readOnly: true };
  let out = trip;
  for (let v = version; v < current; v += 1) {
    const step = migrations[v];
    if (!step) throw new Error(`Migration manquante : ${v} -> ${v + 1}`);
    out = { ...step(out), schemaVersion: v + 1 };
  }
  return { trip: out.schemaVersion === current ? out : { ...out, schemaVersion: current }, readOnly: false };
}
