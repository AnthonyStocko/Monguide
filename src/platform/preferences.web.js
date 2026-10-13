import { createStore, del, get, set } from 'idb-keyval';

// Base distincte de celle des données volumineuses (services/storage.js).
const DB_NAME = 'mon-guide-settings';
const STORE_NAME = 'settings';

let store;

// Ouverture paresseuse : la base n'est créée qu'au premier accès.
function getStore() {
  if (!store) store = createStore(DB_NAME, STORE_NAME);
  return store;
}

export async function getItem(key) {
  return (await get(key, getStore())) ?? null;
}

export async function setItem(key, value) {
  await set(key, value, getStore());
}

export async function removeItem(key) {
  await del(key, getStore());
}
