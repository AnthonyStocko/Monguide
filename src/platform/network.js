import { isNative } from './target.js';

/**
 * Connexion réseau. Natif : @capacitor/network ("wifi", "cellular", "none",
 * "unknown"). Web : navigator.onLine et événements online/offline ; un
 * navigateur ne sait pas dire s'il est en Wi-Fi : "unknown" en ligne, "none"
 * hors ligne.
 */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./network.native.js') : import('./network.web.js'));

/** @type {() => Promise<'wifi' | 'cellular' | 'none' | 'unknown'>} */
export const getConnectionType = impl.getConnectionType;
/** @type {(listener: (type: string) => void) => () => void} renvoie le désabonnement */
export const onConnectionChange = impl.onConnectionChange;
