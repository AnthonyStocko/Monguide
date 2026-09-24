import * as settings from './settings.js';
import * as storage from './storage.js';

/**
 * Séjours enregistrés sur l'appareil (IndexedDB) : chaque séjour est complet
 * (lieux, horaires, réserve de candidats), donc consultable hors ligne.
 * Chaque modification met à jour updatedAt ; une suppression marque le
 * séjour deleted = true (la synchronisation de la phase 5 bis s'appuiera sur
 * ces deux champs).
 */
const PREFIX = 'trip:';
const CURRENT_KEY = 'currentTripId';

/** @param {import('@domain/model.js').Trip} trip */
export function saveTrip(trip) {
  return storage.set(`${PREFIX}${trip.id}`, trip);
}

/**
 * Enregistre une modification (updatedAt mis à jour).
 * @param {import('@domain/model.js').Trip} trip
 * @returns {Promise<import('@domain/model.js').Trip>}
 */
export async function updateTrip(trip) {
  const next = { ...trip, updatedAt: new Date().toISOString() };
  await saveTrip(next);
  return next;
}

/** @param {string} id */
export async function getTrip(id) {
  const trip = await storage.get(`${PREFIX}${id}`);
  return trip && !trip.deleted ? trip : null;
}

/** @returns {Promise<import('@domain/model.js').Trip[]>} séjours non supprimés, du plus récent au plus ancien */
export async function listTrips() {
  const keys = (await storage.keys()).filter((k) => typeof k === 'string' && k.startsWith(PREFIX));
  const trips = await Promise.all(keys.map((k) => storage.get(k)));
  return trips.filter((t) => t && !t.deleted).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Suppression (marquée, pour la synchronisation). */
export async function deleteTrip(id) {
  const trip = await storage.get(`${PREFIX}${id}`);
  if (trip) await saveTrip({ ...trip, deleted: true, updatedAt: new Date().toISOString() });
  if ((await getCurrentTripId()) === id) await settings.remove(CURRENT_KEY);
}

/** Séjour affiché par les onglets Planning et Carte. */
export function getCurrentTripId() {
  return settings.get(CURRENT_KEY);
}

export function setCurrentTripId(id) {
  return settings.set(CURRENT_KEY, id);
}
