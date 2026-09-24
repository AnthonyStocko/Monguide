import { useSyncExternalStore } from 'react';

function subscribe(callback) {
  window.addEventListener('online', callback);
  window.addEventListener('offline', callback);
  return () => {
    window.removeEventListener('online', callback);
    window.removeEventListener('offline', callback);
  };
}

const getSnapshot = () => navigator.onLine;

/** true si l'appareil a une connexion réseau, mis à jour en direct. */
export function useOnlineStatus() {
  return useSyncExternalStore(subscribe, getSnapshot);
}
