import { isNative } from './target.js';

/**
 * Petites valeurs persistantes, en texte (clé, valeur). Natif :
 * @capacitor/preferences. Web : IndexedDB (base séparée), jamais localStorage.
 */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./preferences.native.js') : import('./preferences.web.js'));

/** @type {(key: string) => Promise<string | null>} */
export const getItem = impl.getItem;
/** @type {(key: string, value: string) => Promise<void>} */
export const setItem = impl.setItem;
/** @type {(key: string) => Promise<void>} */
export const removeItem = impl.removeItem;
