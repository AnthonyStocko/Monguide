import { useContext } from 'react';
import { ConfigContext } from '../context/ConfigContext.jsx';

/**
 * Configuration effective (règles, versions, origine) et refresh().
 * @returns {{ config: import('../services/config.js').AppConfig, status: 'loading' | 'ready', updateRequired: boolean, refresh: (options?: { fallback?: boolean }) => Promise<import('../services/config.js').AppConfig> }}
 */
export function useConfig() {
  const value = useContext(ConfigContext);
  if (!value) throw new Error('useConfig doit être utilisé dans ConfigProvider');
  return value;
}
