import { BadgeCheck, Clock, CloudRain, Navigation, Replace, UserPen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { averageRain } from '@domain/weatherArbitration.js';
import { geoUrl } from '../../utils/navigation.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import { CATEGORY_ICONS } from './categories.js';
import RestaurantDetails from './RestaurantDetails.jsx';
import TravelTime from './TravelTime.jsx';

/**
 * Carte d'une étape du planning : horaire (bouton de réglage), lieu,
 * catégorie, badges, trajet estimé, itinéraire et remplacement.
 * @param {{ step: object, day: object, trip: object, rules: any, onEditTime: () => void, onReplace: () => void, showTravel: boolean }} props
 */
export default function StepCard({ step, day, trip, rules, onEditTime, onReplace, showTravel }) {
  const { t } = useTranslation();
  const place = step.place;
  const Icon = place ? CATEGORY_ICONS[place.category] : Clock;
  const rain = day.weatherAvailable && day.weather ? averageRain(day.weather, step.start, step.end) : null;
  const outdoor = place && place.indoor !== true;

  return (
    <li className="space-y-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
      {showTravel && step.travelFromPreviousMin > 0 && (
        <p className="text-ink-muted">
          <TravelTime minutes={step.travelFromPreviousMin} mode={trip.mode} label={t('planning.fromPrevious')} />
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onEditTime}
          aria-label={t('planning.editTime', { start: step.start, end: step.end })}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-line px-3 text-lg font-bold hover:bg-subtle"
        >
          {step.start} – {step.end}
          {step.customTime && <UserPen aria-label={t('planning.customTime')} className="size-5 text-secondary-strong" />}
        </button>
        <span className="text-ink-muted">{t(`generation.stepTypes.${step.type}`)}</span>
      </div>

      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft">
          <Icon aria-hidden="true" className="size-6 text-primary-strong" />
        </span>
        <div className="flex-1 space-y-1">
          <h4 className="text-lg font-semibold">{place ? place.name : t('generation.freeTime')}</h4>
          {place && <p className="text-ink-muted">{t(`categories.${place.category}`)}</p>}
          <div className="flex flex-wrap gap-2">
            {place?.certified && place.certification && (
              <Badge tone="secondary" icon={BadgeCheck}>
                {t(`certifications.${place.certification}`)}
              </Badge>
            )}
            {step.badges.includes('weather_adapted') && <Badge tone="secondary">{t('badges.weather_adapted')}</Badge>}
            {outdoor && rain !== null && (
              <Badge tone={rain > rules.weather.rainThresholdPct ? 'warning' : 'neutral'} icon={CloudRain}>
                {t('planning.rain', { pct: Math.round(rain) })}
              </Badge>
            )}
            {!place?.food && step.badges.includes('hours_unconfirmed') && <Badge tone="warning">{t('badges.hours_unconfirmed')}</Badge>}
          </div>
          {step.specialties?.length > 0 && <p>{t('generation.specialties', { list: step.specialties.join(', ') })}</p>}
        </div>
      </div>

      {place?.food && <RestaurantDetails place={place} date={day.date} countryCode={trip.destination.countryCode} badges={step.badges} />}

      <div className="flex flex-wrap gap-2">
        {place && (
          <a
            href={geoUrl(place, place.name)}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-secondary-strong px-4 font-semibold text-secondary-strong hover:bg-secondary-soft"
          >
            <Navigation aria-hidden="true" className="size-5" />
            {t('planning.directions')}
          </a>
        )}
        <Button variant="secondary" icon={Replace} onClick={onReplace}>
          {t('planning.replace')}
        </Button>
      </div>
    </li>
  );
}
