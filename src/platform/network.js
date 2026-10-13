import { isNative } from './target.js';

/**
 * Connexion réseau. Natif : @capacitor/network ("wifi", "cellular", "none",
 * "unknown"). Web : navigator.onLine et événements online/offline ; un
 * navigateur ne sait pas dire s'il est en Wi-Fi : "unknown" en ligne, "none"
 * hors ligne.
 */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./network.native.js') : import('./network.web.js'));

/** false sur le web : le réglage « Wi-Fi uniquement » n'y a pas de sens et n'est pas proposé. */
export const connectionTypeKnown = impl.connectionTypeKnown;
/** @type {() => Promise<'wifi' | 'cellular' | 'none' | 'unknown'>} */
export const getConnectionType = impl.getConnectionType;
/** @type {(listener: (type: string) => void) => () => void} renvoie le désabonnement */
export const onConnectionChange = impl.onConnectionChange;
