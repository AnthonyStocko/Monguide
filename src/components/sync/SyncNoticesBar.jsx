import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { dismissSyncNotice, onSyncNotices } from '../../services/syncNotices.js';

/** Texte d'un message de la synchronisation (services/syncNotices.js), sans jargon. */
export function noticeText(n, t) {
  const by = n.by ?? t('syncNotices.someone');
  switch (n.kind) {
    case 'rejected':
      return n.stepName ? t('syncNotices.rejected', { step: n.stepName, name: by }) : t('syncNotices.rejectedUnnamed', { name: by });
    case 'removed':
      return t('syncNotices.removed', { title: n.tripTitle });
    case 'deleted':
      return n.by ? t('syncNotices.deleted', { title: n.tripTitle, name: n.by }) : t('syncNotices.deletedByOwner', { title: n.tripTitle });
    case 'outdated':
      return t('syncNotices.outdated', { title: n.tripTitle });
    default:
      return t('syncNotices.rejectedOther', { title: n.tripTitle });
  }
}

/**
 * Messages de la synchronisation, en tête de chaque écran jusqu'à ce que
 * l'utilisateur les ferme : modification refusée, séjour retiré ou supprimé,
 * mise à jour nécessaire. Annoncés aux lecteurs d'écran.
 */
export default function SyncNoticesBar() {
  const { t } = useTranslation();
  const [notices, setNotices] = useState([]);
  useEffect(() => onSyncNotices(setNotices), []);
  return (
    <div role="status" aria-live="polite" className={notices.length ? 'mx-auto w-full max-w-2xl space-y-2 px-4 pt-4' : ''}>
      {notices.map((n) => (
        <div key={n.id} className="flex items-start gap-3 rounded-2xl bg-warning-soft p-3 text-warning-on-soft">
          <AlertTriangle aria-hidden="true" className="mt-3 size-5 shrink-0" />
          <p className="min-w-0 flex-1 py-2">{noticeText(n, t)}</p>
          <button type="button" onClick={() => dismissSyncNotice(n.id)} aria-label={t('common.close')} className="flex size-12 shrink-0 items-center justify-center rounded-xl">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      ))}
    </div>
  );
}
