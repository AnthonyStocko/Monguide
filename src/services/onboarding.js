import * as settings from './settings.js';
import { SETTINGS_KEYS } from './settings.js';

/**
 * Écrans d'accueil du premier lancement : affichés une seule fois (terminés
 * ou passés), jamais ensuite. Lu avant le premier affichage (main.jsx).
 */
let done = true;

export async function initOnboarding() {
  done = (await settings.get(SETTINGS_KEYS.onboardingDone, false).catch(() => true)) === true;
}

/** @returns {boolean} */
export function isOnboardingDone() {
  return done;
}

export async function completeOnboarding() {
  done = true;
  await settings.set(SETTINGS_KEYS.onboardingDone, true).catch(() => {});
}
