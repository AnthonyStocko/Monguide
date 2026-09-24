import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { exactAlarmState, markPermissionAsked, openExactAlarmSetting, permissionState, requestPermission, wasPermissionAsked } from '../../services/notifications.js';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';

/**
 * Écran d'explication présenté au premier enregistrement d'un séjour, avant
 * la demande d'autorisation des notifications (Android 13 et plus). Refuser
 * n'empêche rien : les réglages l'expliquent ensuite.
 */
export default function NotificationsExplainer() {
  const { t } = useTranslation();
  const [step, setStep] = useState(null);

  useEffect(() => {
    (async () => {
      if (await wasPermissionAsked()) return;
      if ((await permissionState()) === 'prompt') setStep('explain');
    })();
  }, []);

  const close = async () => {
    await markPermissionAsked();
    setStep(null);
  };
  const allow = async () => {
    const result = await requestPermission();
    // Alarmes exactes refusées (Android 14) : rappels programmés quand même, avec un possible retard.
    if (result === 'granted' && (await exactAlarmState()) === 'denied') setStep('exact');
    else setStep(null);
  };

  if (step === 'explain') {
    return (
      <Dialog
        title={t('notifications.explainer.title')}
        onClose={close}
        footer={
          <>
            <Button variant="secondary" onClick={close}>
              {t('notifications.explainer.later')}
            </Button>
            <Button icon={Bell} onClick={allow}>
              {t('notifications.explainer.allow')}
            </Button>
          </>
        }
      >
        {t('notifications.explainer.text', { returnObjects: true }).map((p) => (
          <p key={p}>{p}</p>
        ))}
      </Dialog>
    );
  }
  if (step === 'exact') {
    return (
      <Dialog
        title={t('notifications.explainer.exactTitle')}
        onClose={() => setStep(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStep(null)}>
              {t('common.close')}
            </Button>
            <Button
              onClick={async () => {
                await openExactAlarmSetting();
                setStep(null);
              }}
            >
              {t('notifications.settings.openExact')}
            </Button>
          </>
        }
      >
        <p>{t('notifications.settings.exactDenied')}</p>
      </Dialog>
    );
  }
  return null;
}
