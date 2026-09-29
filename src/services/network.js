import { Network } from '@capacitor/network';

/**
 * Type de connexion (@capacitor/network) : "wifi", "cellular", "none" ou
 * "unknown" (navigateur sans navigator.connection). Sert uniquement au
 * réglage "Télécharger les images en Wi-Fi uniquement".
 * @returns {Promise<'wifi' | 'cellular' | 'none' | 'unknown'>}
 */
export async function connectionType() {
  try {
    return (await Network.getStatus()).connectionType;
  } catch {
    return 'unknown';
  }
}

/**
 * Prévient à chaque changement de connexion.
 * @param {(type: string) => void} listener
 * @returns {() => void} désabonnement
 */
export function onConnectionChange(listener) {
  const handle = Network.addListener('networkStatusChange', (status) => listener(status.connectionType));
  return () => {
    handle.then((h) => h.remove()).catch(() => {});
  };
}
