import { useState } from 'react';
import { CalendarHeart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { addDays, todayIn } from '@domain/dates.js';
import { useFormat } from '../../i18n/useFormat.js';
import { getHolidays } from '../../services/dataApi.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';

/** Période testée : les 12 prochains mois à destination. */
const DAYS = 365;

/**
 * Test de la fonction holidays : jours fériés du pays de destination.
 * @param {{ destination: object | null }} props
 */
export default function HolidaysDebug({ destination }) {
  const { t } = useTranslation();
  const format = useFormat();
  const [state, setState] = useState({ status: 'idle' });

  const run = async () => {
    const today = todayIn(destination.timezone);
    setState({ status: 'loading' });
    try {
      const result = await getHolidays({ countryCode: destination.countryCode, startDate: today, endDate: addDays(today, DAYS - 1) });
      setState({ status: 'ok', result });
    } catch (error) {
      setState({ status: 'error', error });
    }
  };

  const dateLabel = (date) => format.date(`${date}T12:00:00Z`, { dateStyle: 'full', timeZone: 'UTC' });

  return (
    <Card as="section" className="space-y-3">
      <h2 className="text-xl font-semibold">{t('debug.holidays.title')}</h2>
      <p className="text-ink-muted">{t('debug.holidays.hint')}</p>
      <Button icon={CalendarHeart} onClick={run} disabled={!destination || state.status === 'loading'} className="w-full">
        {t('debug.holidays.run')}
      </Button>
      {!destination && <p>{t('debug.chooseDestination')}</p>}
      {state.status === 'loading' && <Skeleton className="h-24 w-full" />}
      {state.status === 'error' && <ErrorState message={t(state.error.messageKey)} onRetry={run} />}
      {state.status === 'ok' && (
        <ul className="divide-y divide-line">
          {state.result.data.holidays.length === 0 && <li className="py-2 text-ink-muted">{t('debug.holidays.none')}</li>}
          {state.result.data.holidays.map((h) => (
            <li key={`${h.date}-${h.name}`} className="py-2">
              <span className="font-medium">{dateLabel(h.date)}</span>
              <span className="mt-1 flex flex-wrap items-center gap-2">
                <span>{h.localName}</span>
                {h.global ? <Badge tone="warning">{t('holiday.badge')}</Badge> : <Badge>{t('debug.holidays.regional')}</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
