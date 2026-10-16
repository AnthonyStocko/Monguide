import { onAppActive, onAppHidden } from '../platform/lifecycle.js';
import { currentUserId, markSeen, subscribeTripChanges } from './sharing.js';
import { refreshTrip } from './sync.js';

/**
 * Séjour partagé ouvert : abonnement en direct aux modifications (Supabase
 * Realtime, table trip_changes). Une version plus récente que celle affichée
 * est récupérée aussitôt (copie de l'appareil remplacée : l'écran se met à
 * jour sans rechargement) et notée comme vue. Désabonnement quand
 * l'application passe en arrière-plan ; au retour, nouvel abonnement et
 * dernière version récupérée.
 * @param {{ tripId: string, getVersion: () => number | null, onRemoteChange: (change: object) => void }} options
 *   onRemoteChange : modification d'un autre participant (jamais les siennes)
 * @returns {() => void} arrêt (écran quitté)
 */
export function startLiveTrip({ tripId, getVersion, onRemoteChange }) {
  let unsubscribe = null;
  let me = null;
  let alive = true;
  const catchUp = () => refreshTrip(tripId).catch(() => {});
  const start = () => {
    if (unsubscribe || !alive) return;
    unsubscribe = subscribeTripChanges(tripId, (change) => {
      if (change.author_id !== me) onRemoteChange(change);
      if (change.version > (getVersion() ?? 0)) {
        catchUp();
        markSeen(tripId, change.version);
      }
    });
  };
  const pause = () => {
    unsubscribe?.();
    unsubscribe = null;
  };
  const ready = currentUserId()
    .catch(() => null)
    .then((id) => {
      me = id;
      start();
      catchUp();
    });
  const offHidden = onAppHidden(pause);
  const offActive = onAppActive(() => {
    start();
    catchUp();
  });
  const stop = () => {
    alive = false;
    pause();
    offHidden();
    offActive();
  };
  stop.ready = ready;
  return stop;
}
