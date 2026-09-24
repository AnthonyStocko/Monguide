import { useState } from 'react';
import { Fuel } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../i18n/useFormat.js';
import { getFuel } from '../../services/dataApi.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';

const RADIUS_KM = 20;

/**
 * Test de la fonction fuel : prix moyens à destination, affichés avec
 * Intl.NumberFormat dans la langue de l'interface et la monnaie du pays.
 * @param {{ destination: object | null }} props
 */
export default function FuelDebug({ destination }) {
  const { t } = useTranslation();
  const format = useFormat();
  const [state, setState] = useState({ status: 'idle' });

  const run = async () => {
    setState({ status: 'loading' });
    try {
      const result = await getFuel({ lat: destination.lat, lon: destination.lon, radiusKm: RADIUS_KM, countryCode: destination.countryCode });
      setState({ status: 'ok', result });
    } catch (error) {
      setState({ status: 'error', error });
    }
  };

  const fuel = state.result?.data.fuel;
  const dateLabel = (date) =>
    /^\d{4}-\d{2}$/.test(date)
      ? format.date(`${date}-15T12:00:00Z`, { month: 'long', year: 'numeric', timeZone: 'UTC' })
      : format.date(`${date}T12:00:00Z`, { dateStyle: 'long', timeZone: 'UTC' });

  return (
    <Card as="section" className="space-y-3">
      <h2 className="text-xl font-semibold">{t('debug.fuel.title')}</h2>
      <Button icon={Fuel} onClick={run} disabled={!destination || state.status === 'loading'} className="w-full">
        {t('debug.fuel.run')}
      </Button>
      {!destination && <p>{t('debug.chooseDestination')}</p>}
      {state.status === 'loading' && <Skeleton className="h-24 w-full" />}
      {state.status === 'error' && <ErrorState message={t(state.error.messageKey)} onRetry={run} />}
      {state.status === 'ok' && !fuel && <p className="text-ink-muted">{t('debug.fuel.unavailable')}</p>}
      {state.status === 'ok' && fuel && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {fuel.estimate ? <Badge tone="warning">{t('debug.fuel.estimate')}</Badge> : <Badge tone="primary">{t('debug.fuel.official')}</Badge>}
            {fuel.date && <Badge>{t('debug.fuel.date', { date: dateLabel(fuel.date) })}</Badge>}
          </div>
          <ul className="divide-y divide-line">
            {Object.entries(fuel.prices).map(([code, p]) => (
              <li key={code} className="flex justify-between gap-4 py-2">
                <span>{t(`fuels.${code}`)}</span>
                <span className="font-medium">
                  {t('debug.fuel.perLitre', { price: format.number(p.average, { style: 'currency', currency: fuel.currency, minimumFractionDigits: 2, maximumFractionDigits: 3 }) })}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-ink-muted">{t('debug.fuel.source', { source: fuel.source })}</p>
        </div>
      )}
    </Card>
  );
}
