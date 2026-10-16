import { isNative } from './target.js';

/**
 * Partage d'une adresse (écran À propos). Natif : feuille de partage
 * d'Android (@capacitor/share). Web : partage du navigateur s'il existe.
 */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./shareLink.native.js') : import('./shareLink.web.js'));

/**
 * Un partage annulé par l'utilisateur n'est pas une erreur.
 * @type {(link: { url: string, title: string, text: string, dialogTitle: string }) => Promise<{ shared: boolean }>}
 * shared : false si l'appareil ne sait pas partager.
 */
export const shareLink = impl.shareLink;
