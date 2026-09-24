import { useState } from 'react';
import { UserX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/useAuth.js';
import { deleteAccount } from '../../services/api.js';
import { endSession } from '../../services/sync.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Dialog from '../ui/Dialog.jsx';

/**
 * Suppression du compte, avec double confirmation. Le serveur supprime le
 * compte et ses séjours ; l'appareil efface ensuite ses séjours et la session.
 * Affichée pour un compte connecté, puis le temps du message de confirmation.
 */
export default function DeleteAccountSection() {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const { session } = useAuth();
  const [state, setState] = useState({ status: 'idle' });

  const confirmDeletion = async () => {
    setState({ status: 'loading' });
    try {
      await deleteAccount();
      setStep(0);
      setState({ status: 'done' });
      await endSession({ erase: true });
    } catch (error) {
      setState({ status: 'error', error });
    }
  };

  if (state.status === 'done') {
    return (
      <Card as="section">
        <p role="status">{t('account.deleted')}</p>
      </Card>
    );
  }
  if (!session) return null;

  return (
    <Card as="section" className="space-y-2">
      <h2 className="text-xl font-semibold">{t('account.deleteTitle')}</h2>
      <p className="text-ink-muted">{t('account.deleteHint')}</p>
      <Button variant="secondary" icon={UserX} onClick={() => setStep(1)} className="w-full">
        {t('account.delete')}
      </Button>
      {step === 1 && (
        <Dialog
          title={t('account.confirm1Title')}
          onClose={() => setStep(0)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setStep(0)}>
                {t('common.cancel')}
              </Button>
              <Button onClick={() => setStep(2)}>{t('account.continue')}</Button>
            </>
          }
        >
          <p>{t('account.confirm1Text')}</p>
        </Dialog>
      )}
      {step === 2 && (
        <Dialog
          title={t('account.confirm2Title')}
          onClose={() => setStep(0)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setStep(0)}>
                {t('common.cancel')}
              </Button>
              <Button icon={UserX} onClick={confirmDeletion} disabled={state.status === 'loading'}>
                {t('account.confirmFinal')}
              </Button>
            </>
          }
        >
          <p>{t('account.confirm2Text')}</p>
          {state.status === 'error' && <p className="font-medium text-danger-on-soft">{t(state.error.messageKey ?? 'errors.unknown')}</p>}
        </Dialog>
      )}
    </Card>
  );
}
