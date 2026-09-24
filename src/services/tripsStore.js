import * as storage from './storage.js';

/**
 * Séjours enregistrés sur l'appareil (IndexedDB). La synchronisation avec le
 * serveur et les migrations de schéma arrivent dans des phases ultérieures.
 */
const PREFIX = 'trip:';

/** @param {import('@domain/model.js').Trip} trip */
export function saveTrip(trip) {
  return storage.set(`${PREFIX}${trip.id}`, trip);
}

/** @param {string} id */
export function getTrip(id) {
  return storage.get(`${PREFIX}${id}`);
}

/** @returns {Promise<import('@domain/model.js').Trip[]>} séjours non supprimés, du plus récent au plus ancien */
export async function listTrips() {
  const keys = (await storage.keys()).filter((k) => typeof k === 'string' && k.startsWith(PREFIX));
  const trips = await Promise.all(keys.map((k) => storage.get(k)));
  return trips.filter((t) => t && !t.deleted).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
