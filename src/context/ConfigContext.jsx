import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { onUpdateRequired } from '../services/api.js';
import { defaultConfig, loadConfig } from '../services/config.js';

export const ConfigContext = createContext(null);

/**
 * Charge la configuration au lancement, sans bloquer l'affichage : les
 * valeurs embarquées servent en attendant la réponse du serveur.
 */
export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(() => defaultConfig());
  const [status, setStatus] = useState('loading');
  const [updateRequired, setUpdateRequired] = useState(false);

  /** @param {{ fallback?: boolean }} [options] */
  const refresh = useCallback(async (options) => {
    const next = await loadConfig(options);
    setConfig(next);
    setStatus('ready');
    setUpdateRequired(next.updateRequired);
    return next;
  }, []);

  useEffect(() => {
    refresh();
    return onUpdateRequired(() => setUpdateRequired(true));
  }, [refresh]);

  const value = useMemo(
    () => ({ config, status, updateRequired, refresh }),
    [config, status, updateRequired, refresh]
  );
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}
