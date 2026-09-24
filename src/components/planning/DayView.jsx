import { Fragment } from 'react';
import { CalendarHeart, CloudSun, House, Pencil, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { geoUrl } from '../../utils/navigation.js';
import Button from '../ui/Button.jsx';
import StepCard from './StepCard.jsx';
import TravelTime from './TravelTime.jsx';

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
  const addButton = (afterIndex, label) =>
    !readOnly && (
      <li className="flex justify-center">
        <Button variant="ghost" icon={Plus} onClick={() => onAddStep(afterIndex)}>
          {label}
        </Button>
      </li>
    );

  return (
    <div className="space-y-3">
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
        <p className="flex items-start gap-2">
          <House aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          <span>
            {t('planning.departure', { place: lodgingName(start), time: day.departure.time })}{' '}
            <TravelTime minutes={day.departure.travelMin} mode={trip.mode} />
          </span>
        </p>
      )}

      <ol className="space-y-3">
        {day.steps.map((step, i) => (
          <Fragment key={step.id}>
            <StepCard
              ref={(el) => stepRefs && (stepRefs.current[step.id] = el)}
              step={step}
              day={day}
              trip={trip}
              rules={rules}
              isToday={isToday}
              readOnly={readOnly}
              highlighted={highlightId === step.id}
              showTravel={i > 0 || Boolean(start)}
              onEditTime={() => onEditTime(i)}
              onReplace={() => onReplace(i)}
              onEditPersonal={() => onEditPersonal(i)}
              onTrack={(status) => onTrack(i, status)}
            />
            {i < day.steps.length - 1 && addButton(i, t('personal.addBetween'))}
          </Fragment>
        ))}
        {addButton(day.steps.length - 1, t('personal.addAtEnd'))}
      </ol>

      {end && day.returnTravelMin !== undefined && (
        <p className="flex items-start gap-2">
          <House aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-muted" />
          <TravelTime minutes={day.returnTravelMin} mode={trip.mode} label={t('planning.return', { place: lodgingName(end) })} />
        </p>
      )}
    </div>
  );
}
