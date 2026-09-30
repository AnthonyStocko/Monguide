import { Fragment } from 'react';
import { Bike, BusFront, CalendarHeart, Car, CloudSun, Footprints, House, Pencil, Plus } from 'lucide-react';
import { m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { reviewReasons } from '@domain/applyReview.js';
import Illustration from '../../illustrations/index.jsx';
import { cascadeProps, useFirstShow, useMotionAllowed } from '../../ui/motion.js';
import { geoUrl } from '../../utils/navigation.js';
import Button from '../ui/Button.jsx';
import StepCard from './StepCard.jsx';
import TravelTime from './TravelTime.jsx';

/** Icône du mode de déplacement des trajets entre deux étapes. */
const MODE_ICONS = { walk: Footprints, transit: BusFront, bike: Bike, car: Car };

/**
 * Une journée du planning : bandeau férié, départ de l'hébergement, étapes,
 * boutons "+ Ajouter une étape" entre deux cartes et en fin de journée,
 * retour, bouton "Rentrer" et liens d'hébergement.
 * @param {{
 *   trip: object, dayIndex: number, rules: any, isToday: boolean, readOnly: boolean, highlightId?: string | null,
 *   stepRefs?: import('react').MutableRefObject<Record<string, HTMLElement | null>>,
 *   onEditTime: (i: number) => void, onReplace: (i: number) => void, onLodging: () => void,
 *   onAddStep: (afterIndex: number) => void, onEditPersonal: (i: number) => void, onTrack: (i: number, status: 'done' | 'skipped') => void
 * }} props
 */
export default function DayView({ trip, dayIndex, rules, isToday, readOnly, highlightId, stepRefs, onEditTime, onReplace, onLodging, onAddStep, onEditPersonal, onTrack }) {
  const { t } = useTranslation();
  const day = trip.days[dayIndex];
  const lodging = (id) => trip.lodgings.find((l) => l.id === id);
  const start = lodging(day.startLodgingId);
  const end = lodging(day.endLodgingId);
  const lodgingName = (l) => l.name ?? l.address;
  // Cascade au premier affichage de cette journée seulement (revenir sur l'onglet ne rejoue rien).
  const firstShow = useFirstShow(`day:${trip.id}:${day.date}`);
  const animate = useMotionAllowed() && firstShow;
  // Prochaine étape du jour en cours : bordure verte.
  const currentIndex = isToday ? day.steps.findIndex((st) => (st.status ?? 'planned') === 'planned') : -1;
  const ModeIcon = MODE_ICONS[trip.mode] ?? Footprints;
  // Relecture par l'assistant IA : titre du jour (version relue affichée) et raison de chaque étape modifiée.
  const reviewShown = trip.review?.status === 'applied' || trip.review?.status === 'unchanged';
  const dayTitle = reviewShown ? trip.review.dayTitles?.[day.date] : null;
  const reasons = reviewReasons(trip);
  const addButton = (afterIndex, label) =>
    !readOnly && (
      <m.li {...cascadeProps(afterIndex + 1, animate)} className="flex justify-center">
        <Button variant="ghost" icon={Plus} onClick={() => onAddStep(afterIndex)}>
          {label}
        </Button>
      </m.li>
    );

  return (
    <div className="space-y-3">
      {dayTitle && <h2 className="font-display text-2xl leading-tight">{dayTitle}</h2>}
      {day.holiday && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 font-medium text-warning-on-soft">
          <CalendarHeart aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t('planning.holiday', { name: day.holiday })}
        </p>
      )}
      {!day.weatherAvailable && (
        <p className="flex items-start gap-2 rounded-xl bg-secondary-soft px-3 py-2 text-secondary-on-soft">
          <CloudSun aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t('planning.weatherLater')}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {end && (
          <a
            href={geoUrl(end, lodgingName(end))}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-primary-strong px-4 font-semibold text-white hover:bg-primary-hover"
          >
            <House aria-hidden="true" className="size-5" />
            {t('planning.goHome')}
          </a>
        )}
        {!readOnly && (
          <Button variant="ghost" icon={start || end ? Pencil : Plus} onClick={onLodging}>
            {start || end ? t('planning.editLodging') : t('planning.addLodging')}
          </Button>
        )}
      </div>

      {start && day.departure && (
        <p className="flex items-center gap-3">
          <Illustration name="lodging" className="size-12 shrink-0 rounded-lg" />
          <span>
            {t('planning.departure', { place: lodgingName(start), time: day.departure.time })}{' '}
            <TravelTime minutes={day.departure.travelMin} mode={trip.mode} />
          </span>
        </p>
      )}

      <ol className="space-y-3">
        {day.steps.map((step, i) => (
          <Fragment key={step.id}>
            {(i > 0 || start) && step.travelFromPreviousMin > 0 && (
              <m.li {...cascadeProps(i, animate)} className="flex items-center gap-2 pl-6 text-ink-muted">
                <ModeIcon aria-hidden="true" className="size-5 shrink-0" />
                <TravelTime minutes={step.travelFromPreviousMin} mode={trip.mode} />
              </m.li>
            )}
            <StepCard
              ref={(el) => stepRefs && (stepRefs.current[step.id] = el)}
              step={step}
              day={day}
              trip={trip}
              rules={rules}
              isToday={isToday}
              readOnly={readOnly}
              highlighted={highlightId === step.id}
              current={i === currentIndex}
              reviewReason={reasons.has(step.id) ? (reasons.get(step.id) ?? '') : undefined}
              onEditTime={() => onEditTime(i)}
              onReplace={() => onReplace(i)}
              onEditPersonal={() => onEditPersonal(i)}
              onTrack={(status) => onTrack(i, status)}
              cascade={{ index: i, animate }}
            />
            {i < day.steps.length - 1 && addButton(i, t('personal.addBetween'))}
          </Fragment>
        ))}
        {addButton(day.steps.length - 1, t('personal.addAtEnd'))}
      </ol>

      {end && day.returnTravelMin !== undefined && (
        <p className="flex items-center gap-3">
          <Illustration name="lodging" className="size-12 shrink-0 rounded-lg" />
          <TravelTime minutes={day.returnTravelMin} mode={trip.mode} label={t('planning.return', { place: lodgingName(end) })} />
        </p>
      )}
    </div>
  );
}
