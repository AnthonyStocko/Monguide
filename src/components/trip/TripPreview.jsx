import { CloudSun, Leaf, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../i18n/useFormat.js';
import Badge from '../ui/Badge.jsx';
import Card from '../ui/Card.jsx';

const BADGE_TONES = { weather_adapted: 'secondary', hours_unconfirmed: 'warning', info_missing: 'warning', free_time: 'neutral' };

/**
 * Aperçu d'un séjour généré : journées et étapes, bilan carbone, coût
 * carburant et avertissements. (Le planning complet et interactif arrive
 * dans une phase suivante.)
 * @param {{ trip: import('@domain/model.js').Trip, warnings: { code: string, [k: string]: any }[] }} props
 */
export default function TripPreview({ trip, warnings }) {
  const { t } = useTranslation();
  const format = useFormat();
  const dayLabel = (date) => format.date(`${date}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  const sourceWarnings = warnings.filter((w) => w.code === 'source_failed');
  const otherWarnings = warnings.filter((w) => w.code !== 'source_failed');

  return (
    <div className="space-y-4">
      {warnings.length > 0 && (
        <Card as="section" aria-labelledby="warnings-title" className="space-y-2 border-warning-on-soft bg-warning-soft">
          <h3 id="warnings-title" className="flex items-center gap-2 text-lg font-semibold text-warning-on-soft">
            <TriangleAlert aria-hidden="true" className="size-5" />
            {t('generation.warningsTitle')}
          </h3>
          <ul className="list-disc space-y-1 pl-5 text-warning-on-soft">
            {sourceWarnings.map((w) => (
              <li key={w.source}>
                {w.message === 'not_covered'
                  ? t('sources.notCovered')
                  : t(`sources.${w.source}.failed`, { defaultValue: t('generation.warnings.source_failed', { source: w.source }) })}
              </li>
            ))}
            {otherWarnings.map((w) => (
              <li key={w.code}>{t(`generation.warnings.${w.code}`, { count: w.count ?? 0 })}</li>
            ))}
          </ul>
        </Card>
      )}

      {trip.days.map((day) => (
        <Card as="section" key={day.date} aria-labelledby={`day-${day.date}`} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`day-${day.date}`} className="text-xl font-semibold first-letter:uppercase">
              {dayLabel(day.date)}
            </h3>
            <span className="flex flex-wrap gap-2">
              {day.holiday && <Badge tone="warning">{t('holiday.badge')}</Badge>}
              {!day.weatherAvailable && (
                <Badge tone="neutral" icon={CloudSun}>
                  {t('generation.weatherLater')}
                </Badge>
              )}
            </span>
          </div>
          <ol className="space-y-2">
            {day.departure && (
              <li className="text-ink-muted">{t('generation.departure', { time: day.departure.time, minutes: day.departure.travelMin })}</li>
            )}
            {day.steps.map((step) => (
              <li key={step.id} className="rounded-xl border border-line p-3">
                {step.travelFromPreviousMin > 0 && <p className="text-ink-muted">{t('generation.travel', { minutes: step.travelFromPreviousMin })}</p>}
                <p className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold">
                    {step.start}–{step.end}
                  </span>
                  <span className="text-ink-muted">{t(`generation.stepTypes.${step.type}`)}</span>
                </p>
                <p className="font-medium">{step.place ? step.place.name : t('generation.freeTime')}</p>
                {step.specialties?.length > 0 && <p className="text-ink-muted">{t('generation.specialties', { list: step.specialties.join(', ') })}</p>}
                {step.badges.filter((b) => b !== 'free_time').length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-2">
                    {step.badges
                      .filter((b) => b !== 'free_time')
                      .map((b) => (
                        <Badge key={b} tone={BADGE_TONES[b]}>
                          {t(`badges.${b}`)}
                        </Badge>
                      ))}
                  </span>
                )}
              </li>
            ))}
            {day.returnTravelMin !== undefined && <li className="text-ink-muted">{t('generation.return', { minutes: day.returnTravelMin })}</li>}
          </ol>
        </Card>
      ))}

      {trip.carbon && (
        <Card as="section" aria-labelledby="carbon-title" className="space-y-2">
          <h3 id="carbon-title" className="flex items-center gap-2 text-xl font-semibold">
            <Leaf aria-hidden="true" className="size-5 text-primary" />
            {t('generation.carbonTitle')}
          </h3>
          <p>
            {t('generation.carbonTotal', {
              value: format.number(trip.carbon.totalKgCo2e, { maximumFractionDigits: 2 }),
              km: format.number(trip.carbon.distanceKm, { maximumFractionDigits: 1 })
            })}
          </p>
          <ul className="grid grid-cols-2 gap-2">
            {['walk', 'bike', 'transit', 'car'].map((m) => (
              <li key={m} className={`rounded-xl px-3 py-2 ${m === trip.mode ? 'bg-primary-soft font-semibold' : 'bg-subtle'}`}>
                {t(`modes.${m}`)} : {t('generation.kg', { value: format.number(trip.carbon.byMode[m], { maximumFractionDigits: 2 }) })}
              </li>
            ))}
          </ul>
          {trip.fuelCost && (
            <p>
              {t('generation.fuelCost', {
                amount: format.number(trip.fuelCost.amount, { style: 'currency', currency: trip.fuelCost.currency }),
                consumption: format.number(trip.fuelConsumption, { maximumFractionDigits: 1 })
              })}
            </p>
          )}
          <p className="text-ink-muted">{t('generation.estimates')}</p>
        </Card>
      )}
    </div>
  );
}
