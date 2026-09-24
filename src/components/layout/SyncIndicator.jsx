import { CloudAlert, CloudCheck, CloudOff, CloudUpload, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth.js';

const ICONS = { synced: CloudCheck, pending: CloudUpload, syncing: RefreshCw, offline: CloudOff, error: CloudAlert };

/** Indicateur discret de synchronisation (compte connecté uniquement). */
export default function SyncIndicator() {
  const { t } = useTranslation();
  const { session, syncStatus } = useAuth();
  if (!session || syncStatus === 'guest') return null;
  const Icon = ICONS[syncStatus] ?? CloudCheck;
  const label = t(`sync.status.${syncStatus}`);
  return (
    <span role="status" className="flex size-12 items-center justify-center" title={label}>
      <Icon aria-hidden="true" className={`size-6 ${syncStatus === 'error' ? 'text-danger-on-soft' : 'text-ink-muted'} ${syncStatus === 'syncing' ? 'motion-safe:animate-spin' : ''}`} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
