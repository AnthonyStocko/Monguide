import { Preferences } from '@capacitor/preferences';

/**
 * Petites valeurs persistantes (réglages, index des favoris, session
 * d'authentification), stockées via @capacitor/preferences et sérialisées
 * en JSON. Les données volumineuses vont dans storage.js.
 */

export const SETTINGS_KEYS = {
  language: 'language',
  /** Photos enregistrées pour le hors ligne seulement en Wi-Fi (true par défaut). */
  imagesWifiOnly: 'imagesWifiOnly',
  /** Réglage "Réduire les animations" (false par défaut). */
  reduceMotion: 'reduceMotion',
  /** Vibrations (true par défaut). */
  haptics: 'haptics',
  /** Écrans d'accueil du premier lancement déjà vus (ou passés). */
  onboardingDone: 'onboardingDone',
  /** Relecture du planning par l'assistant IA : null (pas encore demandé), true ou false (aiConsent.js). */
  aiReviewConsent: 'aiReviewConsent',
  /** Identifiant anonyme de l'installation (déploiement progressif de la relecture ; jamais envoyé). */
  installId: 'installId'
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
