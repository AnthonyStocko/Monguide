import { forwardRef } from 'react';
import { BadgeCheck, CircleCheck, CloudRain, Globe, Navigation, Pencil, Replace, SkipForward, TriangleAlert, UserPen } from 'lucide-react';
import { m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { averageRain } from '@domain/weatherArbitration.js';
import { usePlaceName } from '../../i18n/usePlaceName.js';
import { geoUrl, webUrl } from '../../utils/navigation.js';
import { illustrationForStep } from '../../illustrations/index.jsx';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import { usePhoto } from '../ui/Photo.jsx';
import { cascadeProps } from '../../ui/motion.js';
import ValidatedCheck from '../../ui/ValidatedCheck.jsx';
import RestaurantDetails from './RestaurantDetails.jsx';
import { freeLabelKey } from '../../utils/freeLabel.js';

const STATUS_TONES = { planned: 'neutral', done: 'primary', skipped: 'warning' };

/**
 * Carte d'une étape du planning : vignette à gauche (photo du lieu et son
 * crédit écrit en clair, sinon illustration de sa catégorie), plage horaire
 * (bouton de réglage), statut, nom, type et badges ; itinéraire, site du
 * lieu (hors restaurant, qui a le sien) et remplacement. current : prochaine
 * étape du jour (bordure verte). Jour en cours : "Valider cette étape" et
 * "Passer cette étape". Étape personnelle : modifier ou supprimer (jamais
 * remplacée). Les trajets "≈" entre deux cartes sont affichés par DayView.
 * @param {{
 *   step: object, day: object, trip: object, rules: any, isToday: boolean, highlighted?: boolean, current?: boolean, readOnly?: boolean,
 *   onEditTime: () => void, onReplace: () => void, onEditPersonal: () => void, onTrack: (status: 'done' | 'skipped') => void,
 *   cascade?: { index: number, animate: boolean }
 * }} props
 */
const StepCard = forwardRef(function StepCard({ step, day, trip, rules, onEditTime, onReplace, onEditPersonal, onTrack, isToday, highlighted, current = false, readOnly, cascade = { index: 0, animate: false } }, ref) {
  const { t } = useTranslation();
  const { placeName } = usePlaceName();
  const place = step.place;
  const personal = step.type === 'personal';
  const rain = day.weatherAvailable && day.weather ? averageRain(day.weather, step.start, step.end) : null;
  const outdoor = place ? place.indoor !== true : personal && step.indoor === false;
  const status = step.status ?? 'planned';
  const title = personal ? step.title : place ? placeName(place) : t(freeLabelKey(step));
  // Toujours une image : photo du lieu, sinon illustration de sa catégorie (ou du type d'étape).
  // Crédit écrit en clair sous la carte (maquette), pas derrière un bouton.
  const photo = usePhoto({ image: personal ? null : place?.image, illustration: illustrationForStep(step), alt: t('image.alt', { name: title }), className: 'size-20 shrink-0 rounded-xl', credit: 'inline' });

  return (
    <m.li
      {...cascadeProps(cascade.index, cascade.animate)}
      ref={ref}
      id={`step-${step.id}`}
      tabIndex={-1}
      className={`space-y-3 rounded-3xl border-2 bg-surface p-3 shadow-sm ${highlighted ? 'border-primary-strong ring-2 ring-primary-strong' : current ? 'border-primary' : 'border-transparent'}`}
    >
      <div className="flex items-start gap-3">
        {photo.media}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <button
              type="button"
              onClick={personal ? onEditPersonal : onEditTime}
              disabled={readOnly}
              aria-label={t('planning.editTime', { start: step.start, end: step.end })}
              className="-ml-2 inline-flex min-h-12 items-center gap-2 rounded-xl px-2 font-bold text-ink-muted hover:bg-subtle disabled:hover:bg-transparent"
            >
              {step.start} – {step.end}
              {step.customTime && !personal && <UserPen aria-label={t('planning.customTime')} className="size-5 text-secondary-strong" />}
            </button>
            <span className="inline-flex items-center gap-1">
              {/* Validée pendant l'affichage : coche qui apparaît en pop et se dessine. */}
              <ValidatedCheck status={status} />
              <Badge tone={STATUS_TONES[status]}>{t(`tracking.status.${status}`)}</Badge>
            </span>
          </div>
          <h4 className="text-lg leading-snug">{title}</h4>
          <p className="text-ink-muted">
            {t(`generation.stepTypes.${step.type}`)}
            {!personal && place ? ` · ${t(`categories.${place.category}`)}` : ''}
          </p>
          {personal && place?.address && <p className="text-ink-muted">{place.address}</p>}
          <div className="flex flex-wrap gap-2">
            {step.conflicts?.length > 0 && (
              <Badge tone="danger" icon={TriangleAlert}>
                {t('planning.conflict')}
              </Badge>
            )}
            {place?.certified && place.certification && (
              <Badge tone="accent" icon={BadgeCheck}>
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
      {photo.creditBlock}

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
            href={geoUrl(place, title)}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-secondary-strong px-4 font-semibold text-secondary-strong hover:bg-secondary-soft"
          >
            <Navigation aria-hidden="true" className="size-5" />
            {t('planning.directions')}
          </a>
        )}
        {place?.url && !place.food && (
          <a
            href={webUrl(place.url)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-secondary-strong px-4 font-semibold text-secondary-strong hover:bg-secondary-soft"
          >
            <Globe aria-hidden="true" className="size-5" />
            {t('planning.website')}
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
    </m.li>
  );
});

export default StepCard;
