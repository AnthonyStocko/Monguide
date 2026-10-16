import { useEffect, useState } from 'react';
import { Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { dismissJoinedNotice, onJoinedNotices } from '../../services/sharing.js';
import Button from '../ui/Button.jsx';

/** « Anthony vous a ajouté au séjour « Lyon, 3 jours » » : invitation e-mail rattachée à l'ouverture. */
export default function JoinedNotice() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [notices, setNotices] = useState([]);
  useEffect(() => onJoinedNotices(setNotices), []);
  if (!notices.length) return null;
  return (
    <div className="mx-auto w-full max-w-2xl space-y-2 px-4 pt-4">
      {notices.map((n) => (
        <div key={n.tripId} role="status" className="flex items-start gap-3 rounded-2xl bg-secondary-soft p-3 text-secondary-on-soft">
          <Users aria-hidden="true" className="mt-1 size-5 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2">
            <p>{n.ownerName ? t('sharing.addedBy', { name: n.ownerName, title: n.title }) : t('sharing.added', { title: n.title })}</p>
            <Button
              variant="secondary"
              onClick={() => {
                dismissJoinedNotice(n.tripId);
                navigate(`/planning/${n.tripId}`);
              }}
            >
              {t('sharing.openTrip')}
            </Button>
          </div>
          <button type="button" onClick={() => dismissJoinedNotice(n.tripId)} aria-label={t('common.close')} className="flex size-12 shrink-0 items-center justify-center rounded-xl">
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      ))}
    </div>
  );
}
