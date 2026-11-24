import { deleteTrip } from './tripsStore.js';

/**
 * Issue de la boîte de confirmation de suppression d'un séjour.
 * - 'cancelled' : l'utilisateur a annulé, rien n'est supprimé ;
 * - 'deleted' : séjour supprimé (étapes, notes, file d'envoi, photos hors ligne
 *   comprises, et marqué supprimé pour la synchronisation) ;
 * - 'error' : la suppression a échoué, le séjour est conservé.
 * @typedef {{ status: 'cancelled' | 'deleted' | 'error', title: string }} DeletionOutcome
 */

/**
 * Applique le choix fait dans la confirmation. La suppression n'a lieu que
 * si l'utilisateur a confirmé explicitement.
 * @param {'confirm' | 'cancel'} choice
 * @param {{ id: string, title: string }} trip
 * @param {(id: string) => Promise<void>} [remove] injectable pour les tests
 * @returns {Promise<DeletionOutcome>}
 */
export async function resolveTripDeletion(choice, trip, remove = deleteTrip) {
  if (choice !== 'confirm') return { status: 'cancelled', title: trip.title };
  try {
    await remove(trip.id);
  } catch {
    return { status: 'error', title: trip.title };
  }
  return { status: 'deleted', title: trip.title };
}
