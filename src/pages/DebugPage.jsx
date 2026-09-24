import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { API_VERSION } from '@domain/version.js';
import Page from '../components/layout/Page.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { APP_VERSION } from '../config/app.js';
import { useConfig } from '../hooks/useConfig.js';
import { useFormat } from '../i18n/useFormat.js';

function Row({ label, children }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-b border-line py-2 last:border-b-0">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

/** Diagnostic : versions, origine des règles, test d'appel au serveur. */
export default function DebugPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const { config, status, refresh } = useConfig();
  const [check, setCheck] = useState({ state: 'idle' });
  const none = t('debug.notAvailable');

  const callServer = async () => {
    setCheck({ state: 'loading' });
    try {
      await refresh({ fallback: false });
      setCheck({ state: 'ok' });
    } catch (error) {
      setCheck({ state: 'error', error });
    }
  };

  return (
    <Page>
      <Card as="section">
        {status === 'loading' ? (
          <div className="space-y-3">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-6 w-3/4" />
          </div>
        ) : (
          <dl>
            <Row label={t('debug.appVersion')}>{APP_VERSION}</Row>
            <Row label={t('debug.clientApiVersion')}>{API_VERSION}</Row>
            <Row label={t('debug.serverApiVersion')}>{config.apiVersion ?? none}</Row>
            <Row label={t('debug.minAppVersion')}>{config.minAppVersion ?? none}</Row>
            <Row label={t('debug.source')}>
              <Badge tone={config.source === 'server' ? 'primary' : 'warning'}>{t(`debug.sources.${config.source}`)}</Badge>
            </Row>
            <Row label={t('debug.fetchedAt')}>
              {config.fetchedAt ? format.date(config.fetchedAt, { dateStyle: 'medium', timeStyle: 'short' }) : none}
            </Row>
            <Row label={t('debug.rainThreshold')}>
              {format.number(config.rules.weather.rainThresholdPct / 100, { style: 'percent' })}
            </Row>
          </dl>
        )}
        {config.source !== 'server' && config.error && (
          <p className="mt-3 text-ink-muted">{t(config.error.messageKey)}</p>
        )}
      </Card>

      <Card as="section" className="space-y-3">
        <Button icon={RefreshCw} onClick={callServer} disabled={check.state === 'loading'} className="w-full">
          {t('debug.callServer')}
        </Button>
        <div role="status" aria-live="polite">
          {check.state === 'ok' && <Badge tone="primary">{t('debug.callOk')}</Badge>}
        </div>
        {check.state === 'error' && <ErrorState message={t(check.error.messageKey)} onRetry={callServer} />}
      </Card>

      <Card as="section">
        <details>
          <summary className="flex min-h-12 cursor-pointer items-center text-xl font-semibold">{t('debug.rules')}</summary>
          <pre className="mt-2 overflow-x-auto text-base">{JSON.stringify(config.rules, null, 2)}</pre>
        </details>
      </Card>
    </Page>
  );
}
