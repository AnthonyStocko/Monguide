import { tripsRemote } from './api.js';
import * as settings from './settings.js';

/**
 * Séjours partagés, côté écran : nombre de participants (gardé sur
 * l'appareil pour le hors ligne) et historique des modifications.
 */

const COUNT_KEY = (tripId) => `memberCount:${tripId}`;

/**
 * Nombre de participants d'un séjour du compte : lu en ligne, sinon dernière
 * valeur connue (1 si jamais lue).
 * @param {string} tripId
 * @returns {Promise<number>}
 */
export async function memberCount(tripId) {
  try {
    const count = await tripsRemote.memberCount(tripId);
    await settings.set(COUNT_KEY(tripId), count).catch(() => {});
    return count;
  } catch {
    return (await settings.get(COUNT_KEY(tripId)).catch(() => null)) ?? 1;
  }
}

/**
 * Historique d'un séjour (200 dernières modifications), en ligne seulement.
 * @param {string} tripId
 * @returns {Promise<{ id: number, summary: string, created_at: string, author_id: string | null, author: { display_name: string, avatar_color: string | null } | null }[]>}
 */
export function tripChanges(tripId) {
  return tripsRemote.changes(tripId);
}
