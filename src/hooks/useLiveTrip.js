import { useEffect, useRef } from 'react';
import { startLiveTrip } from '../services/liveTrip.js';

/**
 * Modifications des autres participants en direct, pendant que le séjour
 * partagé est affiché (services/liveTrip.js) ; arrêt en quittant l'écran.
 * @param {{ tripId: string | null, version: number | null, enabled: boolean, onRemoteChange: (change: object) => void }} options
 */
export function useLiveTrip({ tripId, version, enabled, onRemoteChange }) {
  const versionRef = useRef(version);
  versionRef.current = version;
  const handlerRef = useRef(onRemoteChange);
  handlerRef.current = onRemoteChange;

  useEffect(() => {
    if (!enabled || !tripId) return undefined;
    return startLiveTrip({ tripId, getVersion: () => versionRef.current, onRemoteChange: (change) => handlerRef.current(change) });
  }, [tripId, enabled]);
}
