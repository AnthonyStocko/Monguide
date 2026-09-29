import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import * as settings from './settings.js';
import { SETTINGS_KEYS } from './settings.js';
import { isAppReducedMotion } from './motion.js';

/**
 * Vibrations, seulement pour : valider une étape, confirmer une action
 * importante, signaler une erreur. Désactivables (réglage "Vibrations",
 * activé par défaut). Avec "Réduire les animations" (téléphone ou
 * application), seules les vibrations essentielles restent : le signal
 * d'erreur. Jamais bloquant : une plateforme sans vibreur est ignorée.
 */
let enabled = null;

/** @returns {Promise<boolean>} */
export async function getHapticsEnabled() {
  if (enabled === null) enabled = (await settings.get(SETTINGS_KEYS.haptics, true).catch(() => true)) !== false;
  return enabled;
}

/** @param {boolean} value */
export async function setHapticsEnabled(value) {
  enabled = Boolean(value);
  await settings.set(SETTINGS_KEYS.haptics, enabled);
}

const phoneReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;

async function run(essential, vibrate) {
  if (!(await getHapticsEnabled())) return;
  if (!essential && (isAppReducedMotion() || phoneReducedMotion())) return;
  try {
    await vibrate();
  } catch {
    // Pas de vibreur (navigateur de bureau) : rien à signaler.
  }
}

/** Étape validée : impact léger. */
export function hapticStepValidated() {
  return run(false, () => Haptics.impact({ style: ImpactStyle.Light }));
}

/** Action importante confirmée (séjour créé, séjour supprimé). */
export function hapticConfirm() {
  return run(false, () => Haptics.notification({ type: NotificationType.Success }));
}

/** Erreur (essentielle : gardée même avec les animations réduites). */
export function hapticError() {
  return run(true, () => Haptics.notification({ type: NotificationType.Error }));
}
