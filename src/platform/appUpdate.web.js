import { registerSW } from 'virtual:pwa-register';

let updateSW = null;
let ready = false;
const listeners = new Set();

export function initAppUpdate() {
  if (updateSW || !('serviceWorker' in globalThis.navigator)) return;
  updateSW = registerSW({
    // Nouvelle version téléchargée : elle attend l'accord de l'utilisateur (bandeau).
    onNeedRefresh() {
      ready = true;
      listeners.forEach((listener) => listener());
    },
    // Application gardée ouverte longtemps : nouvelle version recherchée à chaque retour au premier plan.
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) registration.update().catch(() => {});
      });
    }
  });
}

export const isUpdateReady = () => ready;

export function onUpdateReady(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function applyUpdate() {
  await updateSW?.(true);
}
