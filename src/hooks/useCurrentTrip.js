import { useCallback, useEffect, useState } from 'react';
import { getCurrentTripId, getTrip, listTrips, setCurrentTripId, updateTrip } from '../services/tripsStore.js';

/**
 * Séjour affiché (celui de l'URL, sinon le séjour courant, sinon le plus
 * récent), lu sur l'appareil : disponible hors ligne.
 * @param {string | undefined} tripId
 * @returns {{ status: 'loading' | 'ready' | 'empty', trip: object | null, save: (trip: object) => Promise<object> }}
 */
export function useCurrentTrip(tripId) {
  const [state, setState] = useState({ status: 'loading', trip: null });

  useEffect(() => {
    let alive = true;
    (async () => {
      let trip = null;
      const id = tripId ?? (await getCurrentTripId().catch(() => null));
      if (id) trip = await getTrip(id).catch(() => null);
      if (!trip) trip = (await listTrips().catch(() => []))[0] ?? null;
      if (trip) await setCurrentTripId(trip.id).catch(() => {});
      if (alive) setState({ status: trip ? 'ready' : 'empty', trip });
    })();
    return () => {
      alive = false;
    };
  }, [tripId]);

  const save = useCallback(async (trip) => {
    const saved = await updateTrip(trip);
    setState({ status: 'ready', trip: saved });
    return saved;
  }, []);

  return { ...state, save };
}
