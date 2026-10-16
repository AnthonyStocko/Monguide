import { isNative } from './target.js';

/**
 * Cycle de vie de l'application. Natif : @capacitor/app (appStateChange).
 * Web : événement visibilitychange du document.
 */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./lifecycle.native.js') : import('./lifecycle.web.js'));

/**
 * Prévient à chaque retour de l'application au premier plan (jamais au lancement).
 * @type {(listener: () => void) => () => void} renvoie le désabonnement
 */
export const onAppActive = impl.onAppActive;

/**
 * Prévient quand l'application passe en arrière-plan (écran quitté, autre application).
 * @type {(listener: () => void) => () => void} renvoie le désabonnement
 */
export const onAppHidden = impl.onAppHidden;

/**
 * Prévient quand l'application est ouverte par un lien (Android App Links),
 * y compris au lancement à froid ; sans objet sur le web, où le navigateur
 * charge directement l'adresse.
 * @type {(listener: (url: string) => void) => () => void} renvoie le désabonnement
 */
export const onAppUrlOpen = impl.onAppUrlOpen;
