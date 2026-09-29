import * as settings from './settings.js';
import { SETTINGS_KEYS } from './settings.js';

/**
 * Réglage "Réduire les animations" : attribut data-reduce-motion sur <html>,
 * lu par la variante motion-ok: et par les animations des illustrations
 * (index.css). Les animations sont aussi coupées quand le téléphone le
 * demande (prefers-reduced-motion), quel que soit ce réglage.
 */

const listeners = new Set();
let appReduced = false;

/** @param {boolean} reduce */
export function applyReducedMotion(reduce) {
  appReduced = Boolean(reduce);
  document.documentElement.toggleAttribute('data-reduce-motion', appReduced);
  listeners.forEach((l) => l());
}

/** Réglage de l'application, lu sans attendre (useMotionAllowed). */
export function isAppReducedMotion() {
  return appReduced;
}

/**
 * Prévient à chaque changement du réglage.
 * @param {() => void} listener
 * @returns {() => void}
 */
export function onReducedMotionChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** @returns {Promise<boolean>} */
export async function getReducedMotion() {
  return (await settings.get(SETTINGS_KEYS.reduceMotion, false).catch(() => false)) === true;
}

/** @param {boolean} reduce */
export async function setReducedMotion(reduce) {
  applyReducedMotion(reduce);
  await settings.set(SETTINGS_KEYS.reduceMotion, Boolean(reduce));
}

/** Au lancement, avant le premier affichage : aucune animation ne démarre si le réglage est coché. */
export async function initReducedMotion() {
  applyReducedMotion(await getReducedMotion());
}
