import { useCallback, useEffect, useState } from 'react';
import { BatteryWarning, BellOff, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '../../hooks/useConfig.js';
import {
  exactAlarmState,
  getNotificationPrefs,
  openExactAlarmSetting,
  permissionState,
  reconcileNotifications,
  requestPermission,
  setNotificationPrefs
} from '../../services/notifications.js';
import { TimeSelect } from '../planning/TimeEditorDialog.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Switch from '../ui/Switch.jsx';

/**
 * Réglages des rappels : réception sur cet appareil, résumé de la veille
 * (et son heure), rappel avant chaque étape. Bandeaux explicatifs si la
 * permission est refusée ou si les alarmes exactes ne sont pas autorisées ;
 * aide sur l'optimisation de batterie des fabricants. Jamais bloquant.
 */
export default function NotificationsSection() {
  const { t } = useTranslation();
  const { rules } = useConfig().config;
  const [prefs, setPrefs] = useState(null);
  const [permission, setPermission] = useState('unavailable');
  const [exact, setExact] = useState('unavailable');
  const [pending, setPending] = useState(null);

  const refresh = useCallback(async () => {
    setPrefs(await getNotificationPrefs());
    setPermission(await permissionState());
    setExact(await exactAlarmState());
    const result = await reconcileNotifications();
    setPending(result.error ? null : result.pending);
  }, []);
  useEffect(() => {
    refresh();
    // Retour depuis les réglages du système : état relu.
    const onVisible = () => document.visibilityState === 'visible' && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const update = async (patch) => {
    setPrefs((p) => ({ ...p, ...patch }));
    await setNotificationPrefs(patch);
    await refresh();
  };

  if (!prefs) return null;
  return (
    <Card as="section" aria-labelledby="notifications-title" className="space-y-3">
      <h2 id="notifications-title" className="text-xl font-semibold">
        {t('notifications.settings.title')}
      </h2>

      {permission !== 'granted' && (
        <div className="space-y-2 rounded-xl bg-warning-soft px-3 py-2 text-warning-on-soft">
          <p className="flex items-start gap-2 font-medium">
            <BellOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {t(`notifications.settings.permission.${permission}`)}
          </p>
          {permission === 'prompt' && (
            <Button
              onClick={async () => {
                await requestPermission();
                await refresh();
              }}
            >
              {t('notifications.settings.allow')}
            </Button>
          )}
        </div>
      )}

      {permission === 'granted' && exact === 'denied' && (
        <div className="space-y-2 rounded-xl bg-warning-soft px-3 py-2 text-warning-on-soft">
          <p className="flex items-start gap-2 font-medium">
            <Clock aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {t('notifications.settings.exactDenied')}
          </p>
          <Button variant="secondary" onClick={async () => setExact(await openExactAlarmSetting())}>
            {t('notifications.settings.openExact')}
          </Button>
        </div>
      )}

      <Switch id="notif-device" label={t('notifications.settings.device')} checked={prefs.device} onChange={(device) => update({ device })} />
      <p className="text-ink-muted">{t('notifications.settings.deviceHint')}</p>
      <Switch id="notif-summaries" label={t('notifications.settings.summaries')} checked={prefs.summaries} onChange={(summaries) => update({ summaries })} />
      {prefs.summaries && (
        <TimeSelect
          id="notif-summary-time"
          label={t('notifications.settings.summaryTime')}
          value={prefs.summaryTime ?? rules.notifications.eveningSummaryTime}
          onChange={(summaryTime) => update({ summaryTime })}
        />
      )}
      <Switch
        id="notif-reminders"
        label={t('notifications.settings.reminders', { minutes: rules.notifications.reminderLeadMin })}
        checked={prefs.reminders}
        onChange={(reminders) => update({ reminders })}
      />
      {pending !== null && permission === 'granted' && <p className="text-ink-muted">{t('notifications.settings.pending', { count: pending })}</p>}

      <details className="rounded-xl bg-subtle px-3 py-2">
        <summary className="flex min-h-12 cursor-pointer items-center gap-2 font-medium">
          <BatteryWarning aria-hidden="true" className="size-5 shrink-0" />
          {t('notifications.settings.batteryTitle')}
        </summary>
        <div className="space-y-2 pb-2">
          {t('notifications.settings.batteryText', { returnObjects: true }).map((p) => (
            <p key={p}>{p}</p>
          ))}
        </div>
      </details>
    </Card>
  );
}
