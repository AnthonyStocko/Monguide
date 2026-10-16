import { useEffect, useState } from 'react';
import { cachedMembers, onMembersChanged } from '../services/sharing.js';

/**
 * Participants connus d'un séjour (gardés sur l'appareil, mis à jour après
 * chaque synchronisation) : disponibles hors ligne. null : jamais lus.
 * @param {string | null | undefined} tripId
 * @returns {import('../services/sharing.js').CachedMember[] | null}
 */
export function useTripMembers(tripId) {
  const [members, setMembers] = useState(null);
  useEffect(() => {
    if (!tripId) return undefined;
    let alive = true;
    const load = () => cachedMembers(tripId).then((m) => alive && setMembers(m));
    load();
    const off = onMembersChanged((id) => id === tripId && load());
    return () => {
      alive = false;
      off();
    };
  }, [tripId]);
  return members;
}
