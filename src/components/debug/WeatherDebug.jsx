import { useState } from 'react';
import { CloudSun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { addDays, todayIn } from '@domain/dates.js';
import { useFormat } from '../../i18n/useFormat.js';
import { getWeather } from '../../services/dataApi.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';

/** Premier et dernier jour du séjour de test, comptés depuis aujourd'hui (J). */
const FIRST_DAY = 12;
const LAST_DAY = 18;

function summary(hours) {
  const rain = hours.map((h) => h.precipitationProbability).filter((v) => v !== null);
  const temps = hours.map((h) => h.temperature).filter((v) => v !== null);
  return {
    maxRain: rain.length ? Math.max(...rain) : null,
    minTemp: temps.length ? Math.min(...temps) : null,
    maxTemp: temps.length ? Math.max(...temps) : null
  };
}

/**
 * Test de la fonction weather : séjour de J+12 à J+18 à la destination
 * choisie (J = aujourd'hui dans le fuseau de la destination).
 * @param {{ destination: object | null }} props
 */
export default function WeatherDebug({ destination }) {
  const { t } = useTranslation();
  const format = useFormat();
  const [state, setState] = useState({ status: 'idle' });

  const run = async () => {
    const today = todayIn(destination.timezone);
    setState({ status: 'loading' });
    try {
      const result = await getWeather({
        lat: destination.lat,
        lon: destination.lon,
        timezone: destination.timezone,
        startDate: addDays(today, FIRST_DAY),
        endDate: addDays(today, LAST_DAY)
      });
      setState({ status: 'ok', result, today });
    } catch (error) {
      setState({ status: 'error', error });
    }
  };

  // Date calendaire affichée à midi UTC : même jour quel que soit le fuseau de l'appareil.
  const dayLabel = (date) => format.date(`${date}T12:00:00Z`, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  return (
    <Card as="section" className="space-y-3">
      <h2 className="text-xl font-semibold">{t('debug.weather.title')}</h2>
      <p className="text-ink-muted">{t('debug.weather.hint', { first: FIRST_DAY, last: LAST_DAY })}</p>
      <Button icon={CloudSun} onClick={run} disabled={!destination || state.status === 'loading'} className="w-full">
        {t('debug.weather.run')}
      </Button>
      {!destination && <p>{t('debug.chooseDestination')}</p>}
      {state.status === 'loading' && <Skeleton className="h-40 w-full" />}
      {state.status === 'error' && <ErrorState message={t(state.error.messageKey)} onRetry={run} />}
      {state.status === 'ok' && (
        <>
          {state.result.fromCache && <Badge tone="warning">{t('debug.fromLocalCache')}</Badge>}
          <ul className="divide-y divide-line">
            {state.result.data.days.map((day, i) => {
              const s = day.available ? summary(day.hours) : null;
              return (
                <li key={day.date} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span className="font-medium">
                    {t('debug.weather.dayOffset', { n: FIRST_DAY + i })} · {dayLabel(day.date)}
                  </span>
                  {day.available ? (
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone="primary">{t('debug.weather.available')}</Badge>
                      <span>
                        {s.maxRain === null ? t('debug.weather.rainUnknown') : t('debug.weather.rain', { value: s.maxRain })}
                        {s.minTemp !== null && ` · ${format.number(s.minTemp, { maximumFractionDigits: 0 })}–${format.number(s.maxTemp, { maximumFractionDigits: 0 })} °C`}
                      </span>
                    </span>
                  ) : (
                    <Badge tone="neutral">{t('debug.weather.unavailable')}</Badge>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
