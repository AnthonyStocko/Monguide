import { isNative } from './target.js';

/**
 * Ouverture d'une adresse https hors de l'application (avis d'un
 * restaurant), jamais dans une WebView interne. Natif : intent ACTION_VIEW
 * d'Android (application qui gère l'adresse si elle est installée, sinon le
 * navigateur). Web : nouvel onglet, Mon guide reste ouvert.
 */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./externalUrl.native.js') : import('./externalUrl.web.js'));

/** @type {(url: string) => void} */
export const openExternalUrl = impl.openExternalUrl;
