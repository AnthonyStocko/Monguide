import { createContext, useEffect, useMemo, useState } from 'react';
import { authApi } from '../services/api.js';
import { getSyncStatus, initSync, onSyncStatus } from '../services/sync.js';

export const AuthContext = createContext(null);

/**
 * Session de l'utilisateur (ou mode invité) et état de la synchronisation.
 * Démarre la synchronisation automatique.
 */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined);
  const [syncStatus, setSyncStatus] = useState(getSyncStatus());

  useEffect(() => {
    let alive = true;
    authApi
      .getSession()
      .catch(() => null)
      .then((s) => alive && setSession(s ?? null));
    const offAuth = authApi.onChange((s) => setSession(s ?? null));
    const offSync = onSyncStatus(setSyncStatus);
    initSync();
    return () => {
      alive = false;
      offAuth();
      offSync();
    };
  }, []);

  const value = useMemo(
    () => ({ session, email: session?.user?.email ?? null, loading: session === undefined, syncStatus }),
    [session, syncStatus]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
