import { migrate } from '@domain/migrations.js';
import { applyOps } from '@domain/ops/applyOps.js';
import { diffTrips } from '@domain/ops/diffTrips.js';
import { MAX_OPS_PER_CALL } from '@domain/ops/opTypes.js';
import { rowToTrip } from '@domain/tripRow.js';
import { authApi, tripsRemote } from './api.js';
import { getRules } from './rules.js';
import * as settings from './settings.js';
import * as storage from './storage.js';
import { allTripRecords, detachAllTrips, getQueue, hasPendingOps, onTripsChanged, purgeAllTrips, purgeTrip, saveTrip, setQueue, withTripLock } from './tripsStore.js';

/**
 * Synchronisation des séjours avec le compte, stratégie "local d'abord" :
 * l'appareil fait foi pour l'affichage ; au démarrage, au retour du réseau,
 * à la connexion et après chaque modification :
 *  1. réception : version de chaque séjour accessible (trips.version) ; un
 *     séjour plus récent sur le serveur remplace la copie de l'appareil, les
 *     opérations encore en file y sont réappliquées ; un séjour supprimé ou
 *     devenu inaccessible est effacé de l'appareil ;
 *  2. envoi : opérations en file, par lots de 50, à trip-apply-ops (jamais
 *     le séjour entier) ; séjour inconnu du serveur : opération createTrip.
 * Conflits : le serveur applique chaque opération sur sa dernière version ;
 * deux modifications de deux étapes différentes sont toutes deux gardées.
 *
 * Reprise d'une copie sans version (séjour enregistré avant les opérations,
 * ou gardé après une déconnexion) : l'état "syncState" (updatedAt déjà
 * synchronisé de chaque séjour) dit si elle a des modifications non
 * envoyées ; elles deviennent alors des opérations (diffTrips).
 */

const LEGACY_KEY = 'syncState';

/** @typedef {'guest' | 'synced' | 'pending' | 'syncing' | 'offline' | 'error'} SyncStatus */
let status = 'guest';
const listeners = new Set();
let running = null;
let timer = null;

function setStatus(next) {
  status = next;
  listeners.forEach((l) => l(status));
}

/** @returns {SyncStatus} */
export function getSyncStatus() {
  return status;
}

/** @param {(s: SyncStatus) => void} listener @returns {() => void} */
export function onSyncStatus(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const KEY = (id) => `trip:${id}`;
const hasVersion = (trip) => Number.isInteger(trip?.version);

/**
 * Copie de l'appareil à partir de la version du serveur : opérations en
 * file réappliquées par-dessus.
 */
async function storeRemote(remote, queue) {
  const migrated = migrate(remote);
  const trip = !migrated.readOnly && queue.length ? applyOps(migrated.trip, queue, { rules: getRules() }).trip : remote;
  await setQueue(remote.id, migrated.readOnly ? [] : queue);
  await saveTrip({ ...trip, version: remote.version }, { remote: true });
}

/** Séjour reçu du serveur (plus récent, nouveau, ou copie sans version à reprendre). */
function adoptRemote(remote, legacy) {
  return withTripLock(remote.id, async () => {
    const stored = await storage.get(KEY(remote.id));
    let queue = await getQueue(remote.id);
    if (stored && !hasVersion(stored)) {
      // Copie sans version : modifications non envoyées (d'après syncState) -> opérations.
      const dirty = legacy ? legacy[remote.id] !== stored.updatedAt : false;
      if (dirty && stored.deleted) queue = [{ opId: crypto.randomUUID(), type: 'deleteTrip', params: {} }];
      else if (dirty) queue = diffTrips(migrate(remote).trip, migrate(stored).trip).ops;
    }
    await storeRemote(remote, queue);
  });
}

async function pull(legacy) {
  const remote = new Map((await tripsRemote.listVersions()).map((r) => [r.id, r]));
  const local = await allTripRecords();
  const known = new Set(local.map((t) => t.id));
  const wanted = [];
  for (const trip of local) {
    const r = remote.get(trip.id);
    if (r?.deleted || (!r && hasVersion(trip))) await purgeTrip(trip.id);
    else if (r && (!hasVersion(trip) || r.version > trip.version)) wanted.push(trip.id);
  }
  for (const r of remote.values()) if (!r.deleted && !known.has(r.id)) wanted.push(r.id);
  for (const row of await tripsRemote.fetchRows(wanted)) await adoptRemote(rowToTrip(row), legacy);
}

/** Réponse de trip-apply-ops : version du serveur, opérations envoyées retirées de la file. */
function acknowledge(id, sent, response) {
  return withTripLock(id, async () => {
    if (response.trip.deleted) return purgeTrip(id);
    const done = new Set(sent.map((o) => o.opId));
    const queue = (await getQueue(id)).filter((o) => !done.has(o.opId));
    if (import.meta.env?.DEV && response.rejected?.length) console.warn('trip-apply-ops : opérations refusées', response.rejected);
    await storeRemote({ ...response.trip, version: response.version }, queue);
  });
}

async function sendQueue(trip) {
  for (;;) {
    const queue = await getQueue(trip.id);
    if (!queue.length) return;
    const current = await storage.get(KEY(trip.id));
    if (!current) return;
    const batch = queue.slice(0, MAX_OPS_PER_CALL);
    let response;
    try {
      response = await tripsRemote.applyOps({ tripId: trip.id, baseVersion: current.version, ops: batch });
    } catch (err) {
      // Séjour supprimé ou plus accessible : effacé de l'appareil.
      if (err?.code === 'trip_not_found') return purgeTrip(trip.id);
      // Lot refusé par le serveur (malformé) : abandonné, sinon il bloquerait la file.
      if (err?.code === 'invalid_input') {
        const sent = new Set(batch.map((o) => o.opId));
        await setQueue(trip.id, (await getQueue(trip.id)).filter((o) => !sent.has(o.opId)));
        continue;
      }
      throw err;
    }
    await acknowledge(trip.id, batch, response);
  }
}

/** Séjour pas encore sur le serveur : createTrip avec son contenu actuel. */
async function create(trip) {
  const sentAt = trip.updatedAt;
  const { version: _v, ...content } = migrate(trip).trip;
  let response;
  try {
    response = await tripsRemote.applyOps({ tripId: trip.id, baseVersion: 0, ops: [{ opId: crypto.randomUUID(), type: 'createTrip', params: { trip: content } }] });
  } catch (err) {
    // Identifiant déjà pris par un séjour d'un autre compte (copie gardée après une déconnexion) : nouvel identifiant.
    if (err?.code === 'trip_not_found') return renameLocal(trip);
    throw err;
  }
  await withTripLock(trip.id, async () => {
    const now = await storage.get(KEY(trip.id));
    if (!now) {
      // Supprimé pendant l'envoi : supprimé aussi sur le serveur.
      await tripsRemote.applyOps({ tripId: trip.id, baseVersion: response.version, ops: [{ opId: crypto.randomUUID(), type: 'deleteTrip', params: {} }] }).catch(() => {});
      return;
    }
    // Modifié pendant l'envoi : ces modifications deviennent des opérations.
    const queue = now.updatedAt !== sentAt ? diffTrips(content, migrate(now).trip).ops : [];
    await storeRemote({ ...response.trip, version: response.version }, queue);
  });
}

async function renameLocal(trip) {
  const id = crypto.randomUUID();
  await withTripLock(trip.id, async () => {
    const now = await storage.get(KEY(trip.id));
    if (!now) return;
    await saveTrip({ ...now, id });
    await purgeTrip(trip.id);
  });
}

async function push() {
  for (const trip of await allTripRecords()) {
    if (hasVersion(trip)) await sendQueue(trip);
    else if (trip.deleted) await purgeTrip(trip.id);
    else await create(trip);
  }
}

async function run() {
  const session = await authApi.getSession().catch(() => null);
  if (!session) return setStatus('guest');
  if (!navigator.onLine) return setStatus('offline');
  setStatus('syncing');
  try {
    const legacy = (await settings.get(LEGACY_KEY).catch(() => null))?.synced ?? null;
    await pull(legacy);
    await push();
    // Toutes les copies sans version sont reprises : l'ancien état ne sert plus.
    if (legacy) await settings.remove(LEGACY_KEY);
    setStatus((await hasPendingOps()) ? 'pending' : 'synced');
  } catch {
    setStatus(navigator.onLine ? 'error' : 'offline');
  }
}

/**
 * Dernière version d'un seul séjour (modification reçue en direct, retour au
 * premier plan) : copie de l'appareil remplacée, opérations en file
 * réappliquées. Séjour devenu inaccessible : effacé.
 * @param {string} tripId
 */
export async function refreshTrip(tripId) {
  if (!navigator.onLine) return;
  const [row] = await tripsRemote.fetchRows([tripId]);
  if (!row || row.deleted) {
    await purgeTrip(tripId);
    return;
  }
  const stored = await storage.get(KEY(tripId));
  if (hasVersion(stored) && row.version <= stored.version) return;
  await adoptRemote(rowToTrip(row), null);
}

let again = false;

/**
 * Synchronise maintenant (un seul passage à la fois). Une demande reçue
 * pendant un passage en relance un autre à la fin : une modification faite
 * pendant l'envoi n'est pas oubliée.
 */
export function syncNow() {
  if (running) {
    again = true;
    return running;
  }
  running = run().finally(() => {
    running = null;
    if (again) {
      again = false;
      syncNow();
    }
  });
  return running;
}

/** Synchronise peu après une modification (plusieurs modifications rapprochées = un seul envoi). */
export function scheduleSync() {
  if (status !== 'guest') setStatus(navigator.onLine ? 'pending' : 'offline');
  clearTimeout(timer);
  timer = setTimeout(syncNow, getRules().sync.debounceMs);
}

/**
 * Oublie l'état de synchronisation (déconnexion). Les séjours conservés sur
 * l'appareil deviennent locaux ; ils seront repris par le prochain compte
 * connecté (modifications non envoyées comprises).
 */
export async function resetSyncState() {
  const clean = await detachAllTrips();
  await settings.set(LEGACY_KEY, { synced: clean });
  setStatus('guest');
}

/**
 * Fin de session (déconnexion ou compte supprimé) : déconnexion d'abord, pour
 * qu'aucune synchronisation ne reprenne, attente de celle en cours, puis
 * effacement éventuel des séjours de l'appareil.
 * @param {{ erase?: boolean }} [options]
 */
export async function endSession({ erase = false } = {}) {
  await authApi.signOut();
  while (running) await running.catch(() => {});
  clearTimeout(timer);
  if (erase) {
    await purgeAllTrips();
    await settings.remove(LEGACY_KEY);
    setStatus('guest');
  } else {
    await resetSyncState();
  }
}

let started = false;

/** Démarre la synchronisation automatique (appelé une fois au lancement). */
export function initSync() {
  if (started) return;
  started = true;
  onTripsChanged((_id, { remote }) => !remote && scheduleSync());
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => status !== 'guest' && setStatus('offline'));
  // Hors du rappel d'onAuthStateChange : un appel Supabase à l'intérieur peut bloquer le client.
  authApi.onChange((session) => setTimeout(() => (session ? syncNow() : setStatus('guest')), 0));
  syncNow();
}
