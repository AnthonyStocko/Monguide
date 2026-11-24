import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { hapticConfirm } from '../../services/haptics.js';
import { resolveTripDeletion } from '../../services/tripDeletion.js';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';

/**
 * Confirmation explicite avant de supprimer un séjour (suppression définitive).
 * Annuler ou fermer ne supprime rien ; en cas d'échec le message reste affiché
 * dans la boîte et le séjour est conservé.
 * @param {{ trip: { id: string, title: string }, onClose: () => void, onDeleted: (title: string) => void }} props
 */
export default function DeleteTripDialog({ trip, onClose, onDeleted }) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const choose = async (choice) => {
    setFailed(false);
    setBusy(true);
    const outcome = await resolveTripDeletion(choice, trip);
    setBusy(false);
    if (outcome.status === 'error') return setFailed(true);
    if (outcome.status === 'deleted') {
      hapticConfirm();
      onDeleted(outcome.title);
    } else {
      onClose();
    }
  };

  return (
    <Dialog
      title={t('trips.confirmTitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={() => choose('cancel')} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button icon={Trash2} onClick={() => choose('confirm')} disabled={busy}>
            {t('trips.confirm')}
          </Button>
        </>
      }
    >
      <p>{t('trips.confirmText', { name: trip.title })}</p>
      {failed && (
        <p role="alert" className="mt-2 text-danger-on-soft">
          {t('trips.deleteFailed')}
        </p>
      )}
    </Dialog>
  );
}
