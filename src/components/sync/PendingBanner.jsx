import { CloudCheck, CloudOff, CloudUpload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePendingOps } from '../../hooks/usePendingOps.js';

/**
 * État des modifications du séjour : « Hors ligne · 3 modifications en
 * attente », envoi en cours, puis « Modifications envoyées » (annoncé aux
 * lecteurs d'écran). Rien quand tout est envoyé depuis longtemps.
 */
export default function PendingBanner({ tripId }) {
  const { t } = useTranslation();
  const { count, online, sent } = usePendingOps(tripId);
  const content =
    count > 0
      ? { icon: online ? CloudUpload : CloudOff, text: online ? t('pending.sending', { count }) : t('pending.offline', { count }), tone: 'bg-warning-soft text-warning-on-soft' }
      : sent
        ? { icon: CloudCheck, text: t('pending.sent'), tone: 'bg-primary-soft text-primary-on-soft' }
        : null;
  return (
    <div role="status" aria-live="polite">
      {content && (
        <p className={`flex items-center gap-2 rounded-xl px-3 py-2 font-medium ${content.tone}`}>
          <content.icon aria-hidden="true" className="size-5 shrink-0" />
          {content.text}
        </p>
      )}
    </div>
  );
}
