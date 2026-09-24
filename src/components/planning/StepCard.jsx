import { forwardRef } from 'react';
import { BadgeCheck, CircleCheck, Clock, CloudRain, Navigation, Pencil, Replace, SkipForward, TriangleAlert, UserPen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { averageRain } from '@domain/weatherArbitration.js';
import { geoUrl } from '../../utils/navigation.js';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import { CATEGORY_ICONS } from './categories.js';
import RestaurantDetails from './RestaurantDetails.jsx';
import TravelTime from './TravelTime.jsx';

const STATUS_TONES = { planned: 'neutral', done: 'primary', skipped: 'warning' };

/**
 * Carte d'une étape du planning : horaire (bouton de réglage), statut
 * (prévue, terminée, passée), lieu, badges, trajet estimé, itinéraire et
 * remplacement. Jour en cours : "Valider cette étape" et "Passer cette
 * étape". Étape personnelle : modifier ou supprimer (jamais remplacée).
 * @param {{
 *   step: object, day: object, trip: object, rules: any, showTravel: boolean, isToday: boolean, highlighted?: boolean, readOnly?: boolean,
 *   onEditTime: () => void, onReplace: () => void, onEditPersonal: () => void, onTrack: (status: 'done' | 'skipped') => void
 * }} props
 */
const StepCard = forwardRef(function StepCard({ step, day, trip, rules, onEditTime, onReplace, onEditPersonal, onTrack, showTravel, isToday, highlighted, readOnly }, ref) {
  const { t } = useTranslation();
  const place = step.place;
  const personal = step.type === 'personal';
  const Icon = personal ? CATEGORY_ICONS.personal : place ? CATEGORY_ICONS[place.category] : Clock;
  const rain = day.weatherAvailable && day.weather ? averageRain(day.weather, step.start, step.end) : null;
  const outdoor = place ? place.indoor !== true : personal && step.indoor === false;
  const status = step.status ?? 'planned';
  const title = personal ? step.title : place ? place.name : t('generation.freeTime');

  return (
    <li
      ref={ref}
      id={`step-${step.id}`}
      tabIndex={-1}
      className={`space-y-3 rounded-2xl border bg-surface p-4 shadow-sm ${highlighted ? 'border-primary-strong ring-2 ring-primary-strong' : 'border-line'}`}
    >
      {showTravel && step.travelFromPreviousMin > 0 && (
        <p className="text-ink-muted">
          <TravelTime minutes={step.travelFromPreviousMin} mode={trip.mode} label={t('planning.fromPrevious')} />
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={personal ? onEditPersonal : onEditTime}
          disabled={readOnly}
          aria-label={t('planning.editTime', { start: step.start, end: step.end })}
          className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-line px-3 text-lg font-bold hover:bg-subtle disabled:hover:bg-transparent"
        >
          {step.start} – {step.end}
          {step.customTime && !personal && <UserPen aria-label={t('planning.customTime')} className="size-5 text-secondary-strong" />}
        </button>
        <span className="text-ink-muted">{t(`generation.stepTypes.${step.type}`)}</span>
        <Badge tone={STATUS_TONES[status]}>{t(`tracking.status.${status}`)}</Badge>
      </div>

      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-soft">
          <Icon aria-hidden="true" className="size-6 text-primary-strong" />
        </span>
        <div className="flex-1 space-y-1">
          <h4 className="text-lg font-semibold">{title}</h4>
          {personal && place?.address && <p className="text-ink-muted">{place.address}</p>}
          {!personal && place && <p className="text-ink-muted">{t(`categories.${place.category}`)}</p>}
          <div className="flex flex-wrap gap-2">
            {step.conflicts?.length > 0 && (
              <Badge tone="danger" icon={TriangleAlert}>
                {t('planning.conflict')}
              </Badge>
            )}
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
          {personal && !place && <p className="text-ink-muted">{t('personal.travelUnknown')}</p>}
          {step.note && <p className="whitespace-pre-line">{step.note}</p>}
          {step.specialties?.length > 0 && <p>{t('generation.specialties', { list: step.specialties.join(', ') })}</p>}
        </div>
      </div>

      {place?.food && <RestaurantDetails place={place} date={day.date} countryCode={trip.destination.countryCode} badges={step.badges} />}

      {isToday && status === 'planned' && !readOnly && (
        <div className="grid grid-cols-2 gap-2">
          <Button icon={CircleCheck} onClick={() => onTrack('done')} aria-label={t('tracking.validateNamed', { name: title })}>
            {t('tracking.validate')}
          </Button>
          <Button variant="secondary" icon={SkipForward} onClick={() => onTrack('skipped')} aria-label={t('tracking.skipNamed', { name: title })}>
            {t('tracking.skip')}
          </Button>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {place && (
          <a
            href={geoUrl(place, personal ? title : place.name)}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-secondary-strong px-4 font-semibold text-secondary-strong hover:bg-secondary-soft"
          >
            <Navigation aria-hidden="true" className="size-5" />
            {t('planning.directions')}
          </a>
        )}
        {!readOnly &&
          (personal ? (
            <Button variant="secondary" icon={Pencil} onClick={onEditPersonal} aria-label={t('personal.editNamed', { name: title })}>
              {t('personal.edit')}
            </Button>
          ) : (
            <Button variant="secondary" icon={Replace} onClick={onReplace}>
              {t('planning.replace')}
            </Button>
          ))}
      </div>
    </li>
  );
});

export default StepCard;
