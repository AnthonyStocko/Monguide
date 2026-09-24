import { SCHEMA_VERSION } from './model.js';

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
  // Version 1 : version initiale, aucune migration.
});

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
