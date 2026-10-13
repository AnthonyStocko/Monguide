import * as network from '../platform/network.js';

/** false sur le web : un navigateur ne sait pas dire s'il est en Wi-Fi. */
export const connectionTypeKnown = network.connectionTypeKnown;

/**
 * Type de connexion (platform/network.js) : "wifi", "cellular", "none" ou
 * "unknown" (toujours "unknown" en ligne sur le web). Sert uniquement au
 * réglage "Télécharger les images en Wi-Fi uniquement".
 * @returns {Promise<'wifi' | 'cellular' | 'none' | 'unknown'>}
 */
export async function connectionType() {
  try {
    return await network.getConnectionType();
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
  return network.onConnectionChange(listener);
}
