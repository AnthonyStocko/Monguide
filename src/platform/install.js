import { isNative } from './target.js';

/**
 * Installation de la version web et stockage durable du navigateur. Sans
 * objet dans l'application Android (toujours "installed", stockage durable).
 */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./install.native.js') : import('./install.web.js'));

/** Aide à proposer (voir utils/installHelp.js). @type {() => 'installed' | 'playStore' | 'ios' | 'prompt' | 'none'} */
export const getInstallMode = impl.getInstallMode;
/** Prévient quand l'aide à proposer change. @type {(listener: () => void) => () => void} */
export const onInstallModeChange = impl.onInstallModeChange;
/** Ouvre la fenêtre d'installation du navigateur (mode "prompt") ; true si l'utilisateur accepte. @type {() => Promise<boolean>} */
export const promptInstall = impl.promptInstall;
/** Le navigateur garde-t-il déjà les données sans les effacer de lui-même ? @type {() => Promise<boolean>} */
export const isStoragePersisted = impl.isStoragePersisted;
/** Demande le stockage durable (navigator.storage.persist) ; true s'il est accordé. @type {() => Promise<boolean>} */
export const requestPersistentStorage = impl.requestPersistentStorage;
