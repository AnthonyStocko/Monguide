import { migrate } from '@domain/migrations.js';
import { rowToTrip, tripToRow } from '@domain/tripRow.js';
import { authApi, tripsRemote } from './api.js';
import { getRules } from './rules.js';
import * as settings from './settings.js';
import { allTripRecords, onTripsChanged, purgeAllTrips, purgeTrip, saveTrip } from './tripsStore.js';

/**
 * Synchronisation des séjours avec le compte, stratégie "local d'abord" :
 * l'appareil fait foi pour l'affichage ; au démarrage, au retour du réseau,
 * à la connexion et après chaque modification, on récupère les séjours
 * modifiés à distance depuis la dernière synchronisation, puis on envoie les
 * séjours modifiés localement. Conflit : la version au updatedAt le plus
 * récent l'emporte. Une suppression (deleted = true) est propagée, puis le
 * séjour est purgé de l'appareil.
 *
 * État conservé (réglages) : lastPullAt (updated_at le plus récent reçu) et,
 * par séjour, l'updatedAt déjà synchronisé.
 */

const STATE_KEY = 'syncState';
const emptyState = () => ({ lastPullAt: null, synced: {} });

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

async function loadState() {
  return (await settings.get(STATE_KEY).catch(() => null)) ?? emptyState();
}

const isDirty = (trip, state) => state.synced[trip.id] !== trip.updatedAt;

/**
 * Fusionne les lignes reçues du serveur dans l'appareil.
 * @returns {Promise<void>}
 */
async function applyRemote(rows, state) {
  const local = new Map((await allTripRecords()).map((t) => [t.id, t]));
  for (const row of rows) {
    const remote = rowToTrip(row);
    const mine = local.get(remote.id);
    if (remote.deleted) {
      await purgeTrip(remote.id);
    } else if (!mine || remote.updatedAt > mine.updatedAt) {
      // Version distante plus récente : elle remplace la version locale (migrée à la réception).
      await saveTrip(migrate(remote).trip, { remote: true });
    }
    if (!mine || remote.updatedAt >= mine.updatedAt) state.synced[remote.id] = remote.updatedAt;
    if (!state.lastPullAt || row.updated_at > state.lastPullAt) state.lastPullAt = row.updated_at;
  }
}

async function run() {
  const session = await authApi.getSession().catch(() => null);
  if (!session) return setStatus('guest');
  if (!navigator.onLine) return setStatus('offline');
  setStatus('syncing');
  const state = await loadState();
  try {
    await applyRemote(await tripsRemote.pullSince(state.lastPullAt), state);

    const dirty = (await allTripRecords()).filter((t) => isDirty(t, state));
    await tripsRemote.push(dirty.map(tripToRow));
    for (const trip of dirty) {
      state.synced[trip.id] = trip.updatedAt;
      if (trip.deleted) await purgeTrip(trip.id);
    }
    await settings.set(STATE_KEY, state);
    setStatus('synced');
  } catch {
    await settings.set(STATE_KEY, state).catch(() => {});
    setStatus(navigator.onLine ? 'error' : 'offline');
  }
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
 * l'appareil seront envoyés au prochain compte connecté.
 */
export async function resetSyncState() {
  await settings.remove(STATE_KEY);
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
  if (erase) await purgeAllTrips();
  await resetSyncState();
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
