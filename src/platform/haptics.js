import { isNative } from './target.js';

/** Vibrations. Natif : @capacitor/haptics. Web : sans effet. */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./haptics.native.js') : import('./haptics.web.js'));

/** false sur le web : le réglage "Vibrations" n'y est pas proposé. */
export const hapticsAvailable = impl.hapticsAvailable;
/** Impact léger. @type {() => Promise<void>} */
export const impactLight = impl.impactLight;
/** Signal de réussite. @type {() => Promise<void>} */
export const notifySuccess = impl.notifySuccess;
/** Signal d'erreur. @type {() => Promise<void>} */
export const notifyError = impl.notifyError;
