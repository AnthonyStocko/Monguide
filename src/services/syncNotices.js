import * as settings from './settings.js';

/**
 * Messages de la synchronisation à montrer à l'utilisateur, gardés sur
 * l'appareil jusqu'à ce qu'il les ferme (rien n'est perdu en silence, même
 * si aucun écran n'était ouvert au retour du réseau) :
 *  - rejected : une modification faite hors ligne visait une étape supprimée
 *    entre-temps (stepName, by : prénom de qui l'a supprimée) ;
 *  - rejectedOther : modification refusée pour une autre raison ;
 *  - removed : l'utilisateur ne participe plus au séjour (séjour retiré de l'appareil) ;
 *  - deleted : séjour supprimé par son owner (by) ;
 *  - outdated : application trop ancienne pour envoyer des modifications d'un séjour partagé.
 * @typedef {{ id: string, at: string, kind: 'rejected' | 'rejectedOther' | 'removed' | 'deleted' | 'outdated', tripId: string, tripTitle: string, stepName?: string | null, by?: string | null }} SyncNotice
 */

const KEY = 'syncNotices';
const MAX = 20;
const listeners = new Set();

/** @returns {Promise<SyncNotice[]>} */
export async function syncNotices() {
  return (await settings.get(KEY).catch(() => null)) ?? [];
}

async function save(list) {
  await settings.set(KEY, list).catch(() => {});
  listeners.forEach((l) => l(list));
}

/** @param {Omit<SyncNotice, 'id' | 'at'>} notice */
export async function addSyncNotice(notice) {
  const list = await syncNotices();
  // Même message déjà affiché (ex. séjour retiré, plusieurs synchronisations) : pas de doublon.
  if (notice.kind !== 'rejected' && list.some((n) => n.kind === notice.kind && n.tripId === notice.tripId)) return;
  await save([...list, { id: crypto.randomUUID(), at: new Date().toISOString(), ...notice }].slice(-MAX));
}

export async function dismissSyncNotice(id) {
  await save((await syncNotices()).filter((n) => n.id !== id));
}

/** @param {(notices: SyncNotice[]) => void} listener @returns {() => void} */
export function onSyncNotices(listener) {
  listeners.add(listener);
  syncNotices().then(listener);
  return () => listeners.delete(listener);
}
