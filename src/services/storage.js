import { createStore, get as idbGet, set as idbSet, del, keys as idbKeys } from 'idb-keyval';

/**
 * Données volumineuses (séjours sauvegardés, cache des réponses du serveur),
 * stockées dans IndexedDB via idb-keyval. Les valeurs sont enregistrées telles
 * quelles (clonage structuré) : pas de sérialisation JSON.
 */

const DB_NAME = 'mon-guide';
const STORE_NAME = 'data';

let store;

// Ouverture paresseuse : la base n'est créée qu'au premier accès.
function getStore() {
  if (!store) store = createStore(DB_NAME, STORE_NAME);
  return store;
}

/**
 * @param {IDBValidKey} key
 * @param {*} [fallback] valeur renvoyée si la clé est absente
 */
export async function get(key, fallback = null) {
  const value = await idbGet(key, getStore());
  return value === undefined ? fallback : value;
}

/**
 * @param {IDBValidKey} key
 * @param {*} value
 */
export async function set(key, value) {
  await idbSet(key, value, getStore());
}

/** @param {IDBValidKey} key */
export async function remove(key) {
  await del(key, getStore());
}

/** @returns {Promise<IDBValidKey[]>} */
export async function keys() {
  return idbKeys(getStore());
}
