import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';

/** Bannière affichée tant que le réseau est coupé. */
export default function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnlineStatus();

  return (
    <div role="status" aria-live="polite">
      {!online && (
        <p className="flex items-center gap-2 bg-warning-soft px-4 py-2 font-medium text-warning-on-soft">
          <WifiOff aria-hidden="true" className="size-5 shrink-0" />
          {t('offline.message')}
        </p>
      )}
    </div>
  );
}
