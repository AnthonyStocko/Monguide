import { useEffect, useSyncExternalStore } from 'react';
import { aiReviewAvailable } from '@domain/wishes.js';
import * as settings from './settings.js';
import { SETTINGS_KEYS } from './settings.js';

/**
 * Consentement à la relecture du planning par l'assistant IA
 * (docs/ai-review.md) : null tant que la question n'a pas été posée (écran
 * de consentement à la première génération), puis true ou false, modifiable
 * dans les réglages (« Relecture par l'assistant IA »). Refusé : aucune
 * relecture demandée au serveur, champ « Vos envies » masqué.
 */

/** @type {boolean | null | undefined} undefined : pas encore lu */
let value;
const listeners = new Set();
const emit = () => listeners.forEach((l) => l());

/** @returns {Promise<boolean | null>} */
export async function getAiConsent() {
  if (value === undefined) {
    const stored = await settings.get(SETTINGS_KEYS.aiReviewConsent, null).catch(() => null);
    value = typeof stored === 'boolean' ? stored : null;
    emit();
  }
  return value;
}

/** @param {boolean} next */
export async function setAiConsent(next) {
  value = Boolean(next);
  emit();
  await settings.set(SETTINGS_KEYS.aiReviewConsent, value).catch(() => {});
}

/** @type {string | null | undefined} identifiant anonyme de l'installation (undefined : pas encore lu) */
let installId;

/**
 * Identifiant anonyme de l'installation, tiré au hasard une fois : sert
 * uniquement au déploiement progressif (rules.ai.rolloutPercent, décidé sur
 * l'appareil) ; jamais envoyé au serveur.
 * @returns {Promise<string>}
 */
export async function getInstallId() {
  if (typeof installId !== 'string') {
    let id = await settings.get(SETTINGS_KEYS.installId, null).catch(() => null);
    if (typeof id !== 'string' || !id) {
      id = crypto.randomUUID();
      await settings.set(SETTINGS_KEYS.installId, id).catch(() => {});
    }
    installId = id;
    emit();
  }
  return installId;
}

/**
 * Relecture proposée à cette installation (aiReviewAvailable : activation,
 * fournisseur, déploiement progressif), mise à jour en direct.
 * @returns {boolean | undefined} undefined pendant la lecture de l'identifiant
 */
export function useAiReviewAvailable(rules) {
  useEffect(() => {
    getInstallId();
  }, []);
  const id = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => installId
  );
  return id === undefined ? undefined : aiReviewAvailable(rules, id);
}

/**
 * Consentement, mis à jour en direct (formulaire, réglages).
 * @returns {boolean | null | undefined} undefined pendant la lecture
 */
export function useAiConsent() {
  useEffect(() => {
    getAiConsent();
  }, []);
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => value
  );
}
