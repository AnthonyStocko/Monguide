import { installMode } from '../utils/installHelp.js';

/** Événement beforeinstallprompt retenu (Chrome, Edge) : sert au bouton « Installer l'application ». */
let deferredPrompt = null;
let mode = null;
const listeners = new Set();

/** Application ouverte depuis l'écran d'accueil (iPhone : navigator.standalone). */
const isStandalone = () => globalThis.matchMedia?.('(display-mode: standalone)').matches === true || globalThis.navigator?.standalone === true;

function refresh() {
  const next = installMode({
    userAgent: globalThis.navigator?.userAgent ?? '',
    maxTouchPoints: globalThis.navigator?.maxTouchPoints ?? 0,
    standalone: isStandalone(),
    promptAvailable: deferredPrompt !== null
  });
  if (next === mode) return;
  mode = next;
  listeners.forEach((listener) => listener());
}

// L'événement arrive peu après le chargement : écouté dès l'import du module.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Pas de bandeau du navigateur : l'application propose son propre bouton.
    event.preventDefault();
    deferredPrompt = event;
    refresh();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    refresh();
  });
}

export function getInstallMode() {
  if (mode === null) refresh();
  return mode;
}

export function onInstallModeChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function promptInstall() {
  if (!deferredPrompt) return false;
  // Un événement ne sert qu'une fois.
  const event = deferredPrompt;
  deferredPrompt = null;
  try {
    await event.prompt();
    return (await event.userChoice).outcome === 'accepted';
  } catch {
    return false;
  } finally {
    refresh();
  }
}

export async function isStoragePersisted() {
  try {
    return (await navigator.storage?.persisted?.()) === true;
  } catch {
    return false;
  }
}

export async function requestPersistentStorage() {
  try {
    return (await navigator.storage?.persist?.()) === true;
  } catch {
    return false;
  }
}
