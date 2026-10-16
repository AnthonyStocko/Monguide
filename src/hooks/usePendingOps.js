import { useEffect, useRef, useState } from 'react';
import { getQueue, onQueueChanged } from '../services/tripsStore.js';
import { useOnlineStatus } from './useOnlineStatus.js';

/**
 * Modifications d'un séjour en attente d'envoi (file de l'appareil) :
 * count, et sent = true pendant 4 s quand la file vient de se vider en ligne
 * (« Modifications envoyées »).
 * @param {string | null | undefined} tripId
 * @returns {{ count: number, online: boolean, sent: boolean }}
 */
export function usePendingOps(tripId) {
  const online = useOnlineStatus();
  const [count, setCount] = useState(0);
  const [sent, setSent] = useState(false);
  const previous = useRef(0);
  const timer = useRef(null);

  useEffect(() => {
    if (!tripId) return undefined;
    let alive = true;
    const update = (n) => {
      if (!alive) return;
      if (previous.current > 0 && n === 0 && navigator.onLine) {
        setSent(true);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => alive && setSent(false), 4000);
      }
      if (n > 0) setSent(false);
      previous.current = n;
      setCount(n);
    };
    getQueue(tripId).then((q) => {
      previous.current = q.length;
      if (alive) setCount(q.length);
    });
    const off = onQueueChanged((id, n) => id === tripId && update(n));
    return () => {
      alive = false;
      off();
      clearTimeout(timer.current);
    };
  }, [tripId]);

  return { count, online, sent };
}
