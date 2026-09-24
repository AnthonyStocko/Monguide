import { Preferences } from '@capacitor/preferences';

/**
 * Petites valeurs persistantes (réglages, index des favoris, session
 * d'authentification), stockées via @capacitor/preferences et sérialisées
 * en JSON. Les données volumineuses vont dans storage.js.
 */

export const SETTINGS_KEYS = {
  language: 'language'
};

/**
 * @param {string} key
 * @param {*} [fallback] valeur renvoyée si la clé est absente ou illisible
 */
export async function get(key, fallback = null) {
  const { value } = await Preferences.get({ key });
  if (value === null) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * @param {string} key
 * @param {*} value toute valeur sérialisable en JSON
 */
export async function set(key, value) {
  await Preferences.set({ key, value: JSON.stringify(value) });
}

/** @param {string} key */
export async function remove(key) {
  await Preferences.remove({ key });
}
