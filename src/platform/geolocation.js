import { isNative } from './target.js';

/**
 * Position de l'appareil. Natif : @capacitor/geolocation. Web :
 * navigator.geolocation (HTTPS obligatoire). La permission n'est demandée
 * qu'à l'appel : n'appeler que sur une action de l'utilisateur.
 */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./geolocation.native.js') : import('./geolocation.web.js'));

/** @type {(options: { enableHighAccuracy?: boolean, timeout?: number }) => Promise<{ coords: { latitude: number, longitude: number } }>} */
export const getCurrentPosition = impl.getCurrentPosition;
