import { useCallback, useEffect, useState } from 'react';
import { getCurrentTripId, listTrips, loadTrip, onTripsChanged, setCurrentTripId, updateTrip } from '../services/tripsStore.js';

/**
 * Séjour affiché (celui de l'URL, sinon le séjour courant, sinon le plus
 * récent), lu sur l'appareil : disponible hors ligne. readOnly : séjour créé
 * par une version plus récente de l'application, consultable mais non modifiable.
 * @param {string | undefined} tripId
 * @returns {{ status: 'loading' | 'ready' | 'empty', trip: object | null, readOnly: boolean, save: (trip: object) => Promise<object> }}
 */
export function useCurrentTrip(tripId) {
  const [state, setState] = useState({ status: 'loading', trip: null, readOnly: false });
  const [version, setVersion] = useState(0);

  // Rechargement quand la synchronisation modifie ou supprime des séjours.
  useEffect(() => onTripsChanged(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      let loaded = null;
      const id = tripId ?? (await getCurrentTripId().catch(() => null));
      if (id) loaded = await loadTrip(id).catch(() => null);
      if (!loaded) {
        const first = (await listTrips().catch(() => []))[0];
        if (first) loaded = await loadTrip(first.id).catch(() => null);
      }
      if (loaded) await setCurrentTripId(loaded.trip.id).catch(() => {});
      if (alive) setState({ status: loaded ? 'ready' : 'empty', trip: loaded?.trip ?? null, readOnly: loaded?.readOnly ?? false });
    })();
    return () => {
      alive = false;
    };
  }, [tripId, version]);

  const save = useCallback(async (trip) => {
    const saved = await updateTrip(trip);
    setState({ status: 'ready', trip: saved, readOnly: false });
    return saved;
  }, []);

  return { ...state, save };
}
