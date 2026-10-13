import { isNative } from './target.js';

/**
 * Mise à jour de la version web (service worker). Sans objet dans
 * l'application Android, mise à jour par le Play Store.
 */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./appUpdate.native.js') : import('./appUpdate.web.js'));

/** Enregistre le service worker (une fois, au lancement). @type {() => void} */
export const initAppUpdate = impl.initAppUpdate;
/** Une nouvelle version est-elle prête à être installée ? @type {() => boolean} */
export const isUpdateReady = impl.isUpdateReady;
/** Prévient quand une nouvelle version est prête. @type {(listener: () => void) => () => void} */
export const onUpdateReady = impl.onUpdateReady;
/** Installe la nouvelle version et recharge l'application : seulement à la demande de l'utilisateur. @type {() => Promise<void>} */
export const applyUpdate = impl.applyUpdate;
