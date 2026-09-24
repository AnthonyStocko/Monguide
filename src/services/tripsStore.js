import { migrate } from '@domain/migrations.js';
import * as settings from './settings.js';
import * as storage from './storage.js';

/**
 * Séjours enregistrés sur l'appareil (IndexedDB) : chaque séjour est complet
 * (lieux, horaires, réserve de candidats), donc consultable hors ligne.
 * Chaque modification met à jour updatedAt et prévient la synchronisation ;
 * une suppression marque le séjour deleted = true, propagé aux autres
 * appareils puis purgé (services/sync.js). Chaque lecture passe par
 * migrate() (schéma à jour, ou lecture seule si plus récent que l'application).
 */
const PREFIX = 'trip:';
const CURRENT_KEY = 'currentTripId';

const listeners = new Set();

/**
 * Prévient à chaque modification d'un séjour : listener(id, { remote }).
 * remote = true pour une écriture de la synchronisation (à afficher, mais
 * pas à renvoyer au serveur). id = null : tous les séjours ont été effacés.
 * @returns {() => void}
 */
export function onTripsChanged(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * @param {import('@domain/model.js').Trip} trip
 * @param {{ remote?: boolean }} [options] remote : écriture venant de la synchronisation
 */
export async function saveTrip(trip, { remote = false } = {}) {
  await storage.set(`${PREFIX}${trip.id}`, trip);
  listeners.forEach((l) => l(trip.id, { remote }));
}

/**
 * Enregistre une modification (updatedAt mis à jour).
 * @returns {Promise<import('@domain/model.js').Trip>}
 */
export async function updateTrip(trip) {
  const next = { ...trip, updatedAt: new Date().toISOString() };
  await saveTrip(next);
  return next;
}

/**
 * Séjour migré, et s'il doit être en lecture seule.
 * @param {string} id
 * @returns {Promise<{ trip: import('@domain/model.js').Trip, readOnly: boolean } | null>}
 */
export async function loadTrip(id) {
  const raw = await storage.get(`${PREFIX}${id}`);
  return raw && !raw.deleted ? migrate(raw) : null;
}

/** @param {string} id */
export async function getTrip(id) {
  return (await loadTrip(id))?.trip ?? null;
}

/** Tous les séjours enregistrés, y compris ceux marqués supprimés (synchronisation). */
export async function allTripRecords() {
  const keys = (await storage.keys()).filter((k) => typeof k === 'string' && k.startsWith(PREFIX));
  return (await Promise.all(keys.map((k) => storage.get(k)))).filter(Boolean);
}

/** @returns {Promise<import('@domain/model.js').Trip[]>} séjours non supprimés, du plus récent au plus ancien */
export async function listTrips() {
  return (await allTripRecords())
    .filter((t) => !t.deleted)
    .map((t) => migrate(t).trip)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Suppression (marquée, pour la synchronisation). */
export async function deleteTrip(id) {
  const trip = await storage.get(`${PREFIX}${id}`);
  if (trip) await saveTrip({ ...trip, deleted: true, updatedAt: new Date().toISOString() });
  if ((await getCurrentTripId()) === id) await settings.remove(CURRENT_KEY);
}

/** Efface définitivement un séjour de l'appareil (après synchronisation de sa suppression). */
export async function purgeTrip(id) {
  await storage.remove(`${PREFIX}${id}`);
  if ((await getCurrentTripId()) === id) await settings.remove(CURRENT_KEY);
  listeners.forEach((l) => l(id, { remote: true }));
}

/** Efface tous les séjours de l'appareil (déconnexion avec effacement, suppression du compte). */
export async function purgeAllTrips() {
  const keys = (await storage.keys()).filter((k) => typeof k === 'string' && k.startsWith(PREFIX));
  await Promise.all(keys.map((k) => storage.remove(k)));
  await settings.remove(CURRENT_KEY);
  listeners.forEach((l) => l(null, { remote: true }));
}

/** Séjour affiché par les onglets Planning et Carte. */
export function getCurrentTripId() {
  return settings.get(CURRENT_KEY);
}

export function setCurrentTripId(id) {
  return settings.set(CURRENT_KEY, id);
}
