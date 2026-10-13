import { isNative } from './target.js';

/**
 * Remet un fichier produit par l'application (export PDF) à l'utilisateur.
 * Natif : fichier écrit dans le cache (@capacitor/filesystem) puis feuille de
 * partage (@capacitor/share). Web : partage avec fichier (Web Share API
 * niveau 2) sur les appareils tactiles qui le proposent (iPhone, iPad),
 * sinon téléchargement.
 */
const impl = await (import.meta.env.VITE_TARGET !== 'web' && isNative ? import('./shareFile.native.js') : import('./shareFile.web.js'));

/**
 * Un partage annulé par l'utilisateur n'est pas une erreur.
 * @type {(file: { fileName: string, mimeType: string, title: string, dialogTitle: string, toBase64: () => string, toBlob: () => Blob }) => Promise<{ shared: boolean }>}
 * shared : true si la feuille de partage a été proposée, false si le fichier a été téléchargé.
 */
export const shareFile = impl.shareFile;
