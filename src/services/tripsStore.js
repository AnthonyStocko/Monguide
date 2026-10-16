import { migrate } from '@domain/migrations.js';
import { applyOps } from '@domain/ops/applyOps.js';
import { diffTrips } from '@domain/ops/diffTrips.js';
import { deleteAllTripPhotos, deleteTripPhotos } from './offlineImages.js';
import { getRules } from './rules.js';
import * as settings from './settings.js';
import * as storage from './storage.js';

/**
 * Séjours enregistrés sur l'appareil (IndexedDB) : chaque séjour est complet
 * (lieux, horaires, réserve de candidats), donc consultable hors ligne.
 *
 * Une modification faite à l'écran n'est jamais envoyée comme séjour
 * complet : updateTrip la traduit en opérations (domain/ops/diffTrips.js),
 * les applique tout de suite à la copie de l'appareil (affichage immédiat,
 * hors ligne compris) et, pour un séjour déjà sur le serveur (champ
 * version), les met en file ("tripq:<id>") ; services/sync.js les envoie à
 * trip-apply-ops et remplace la copie par la version renvoyée, file restante
 * réappliquée. Chaque lecture passe par migrate() (schéma à jour, ou lecture
 * seule si plus récent que l'application).
 */
const PREFIX = 'trip:';
const QUEUE_PREFIX = 'tripq:';
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

const notify = (id, remote) => listeners.forEach((l) => l(id, { remote }));

// Une seule lecture-écriture à la fois par séjour (écran, photos et synchronisation).
const locks = new Map();
/** @template T @param {string} id @param {() => Promise<T>} fn @returns {Promise<T>} */
export function withTripLock(id, fn) {
  const previous = locks.get(id) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(fn);
  locks.set(id, next);
  return next.finally(() => {
    if (locks.get(id) === next) locks.delete(id);
  });
}

/**
 * Enregistre un séjour tel quel (création à la génération, ou version reçue
 * du serveur par la synchronisation).
 * @param {import('@domain/model.js').Trip} trip
 * @param {{ remote?: boolean }} [options] remote : écriture venant de la synchronisation
 */
export async function saveTrip(trip, { remote = false } = {}) {
  await storage.set(`${PREFIX}${trip.id}`, trip);
  notify(trip.id, remote);
}

/**
 * Enregistre une modification faite à l'écran.
 * @param {import('@domain/model.js').Trip} next séjour après l'action
 * @param {import('@domain/model.js').Trip} [base] séjour affiché quand l'action a été faite (par défaut : la
 *   dernière version enregistrée). Seules les différences entre base et next sont appliquées à la
 *   dernière version : une photo ou une modification reçue entre-temps est conservée.
 * @returns {Promise<import('@domain/model.js').Trip>} séjour enregistré
 */
export function updateTrip(next, base) {
  return withTripLock(next.id, async () => {
    const stored = await storage.get(`${PREFIX}${next.id}`);
    const now = new Date().toISOString();
    if (!stored) {
      const created = { ...next, updatedAt: now };
      await saveTrip(created);
      return created;
    }
    const latest = migrate(stored).trip;
    const { ops, unsupported } = diffTrips(base ?? latest, next);
    if (unsupported.length && import.meta.env?.DEV) console.warn('diffTrips : changements sans opération', unsupported);
    if (!ops.length) return latest;
    const saved = { ...applyOps(latest, ops, { rules: getRules() }).trip, updatedAt: now };
    await storage.set(`${PREFIX}${next.id}`, saved);
    if (Number.isInteger(latest.version)) await setQueue(next.id, [...(await getQueue(next.id)), ...ops]);
    notify(next.id, false);
    return saved;
  });
}

/** Opérations en attente d'envoi d'un séjour. @param {string} id @returns {Promise<object[]>} */
export async function getQueue(id) {
  return (await storage.get(`${QUEUE_PREFIX}${id}`)) ?? [];
}

/** @param {string} id @param {object[]} ops */
export async function setQueue(id, ops) {
  if (ops.length) await storage.set(`${QUEUE_PREFIX}${id}`, ops);
  else await storage.remove(`${QUEUE_PREFIX}${id}`);
}

/** Des opérations attendent-elles d'être envoyées ? */
export async function hasPendingOps() {
  return (await storage.keys()).some((k) => typeof k === 'string' && k.startsWith(QUEUE_PREFIX));
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

/**
 * Suppression : séjour déjà sur le serveur, opération deleteTrip mise en file
 * (séjour masqué tout de suite, effacé quand le serveur l'a supprimé) ;
 * sinon, effacé de l'appareil.
 */
export async function deleteTrip(id) {
  await withTripLock(id, async () => {
    const trip = await storage.get(`${PREFIX}${id}`);
    if (!trip) return;
    if (Number.isInteger(trip.version)) {
      await storage.set(`${PREFIX}${id}`, { ...trip, deleted: true, updatedAt: new Date().toISOString() });
      await setQueue(id, [...(await getQueue(id)), { opId: crypto.randomUUID(), type: 'deleteTrip', params: {} }]);
      notify(id, false);
    } else {
      await removeTrip(id);
    }
  });
  if ((await getCurrentTripId()) === id) await settings.remove(CURRENT_KEY);
  await forgetPhotos(id);
}

/** Photos enregistrées pour le hors ligne et marque de vérification d'un séjour supprimé. */
async function forgetPhotos(id) {
  await deleteTripPhotos(id).catch(() => {});
  await storage.remove(`tripimgcheck:${id}`).catch(() => {});
}

async function removeTrip(id) {
  await storage.remove(`${PREFIX}${id}`);
  await storage.remove(`${QUEUE_PREFIX}${id}`);
  notify(id, true);
}

/** Efface définitivement un séjour de l'appareil (supprimé sur le serveur, ou plus accessible). */
export async function purgeTrip(id) {
  await removeTrip(id);
  if ((await getCurrentTripId()) === id) await settings.remove(CURRENT_KEY);
  await forgetPhotos(id);
}

/** Efface tous les séjours de l'appareil (déconnexion avec effacement, suppression du compte). */
export async function purgeAllTrips() {
  const keys = (await storage.keys()).filter((k) => typeof k === 'string' && (k.startsWith(PREFIX) || k.startsWith(QUEUE_PREFIX) || k.startsWith('tripimgcheck:')));
  await Promise.all(keys.map((k) => storage.remove(k)));
  await settings.remove(CURRENT_KEY);
  await deleteAllTripPhotos().catch(() => {});
  notify(null, true);
}

/**
 * Déconnexion sans effacement : les séjours restent sur l'appareil comme
 * séjours locaux (sans version ni file). Renvoie, pour la reprise au
 * prochain compte (services/sync.js), l'updatedAt de chaque séjour sans
 * modification en attente.
 * @returns {Promise<Record<string, string>>}
 */
export async function detachAllTrips() {
  const clean = {};
  for (const trip of await allTripRecords()) {
    const pending = (await getQueue(trip.id)).length > 0;
    const { version: _version, ...rest } = trip;
    if (!pending) clean[trip.id] = trip.updatedAt;
    if (trip.deleted && !Number.isInteger(trip.version)) continue;
    await storage.set(`${PREFIX}${trip.id}`, rest);
    await storage.remove(`${QUEUE_PREFIX}${trip.id}`);
  }
  notify(null, true);
  return clean;
}

/** Séjour affiché par les onglets Planning et Carte. */
export function getCurrentTripId() {
  return settings.get(CURRENT_KEY);
}

export function setCurrentTripId(id) {
  return settings.set(CURRENT_KEY, id);
}
