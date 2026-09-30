import { useState } from 'react';
import { CalendarCheck, Plus, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { makePlaceStep } from '@domain/addPlaceStep.js';
import { checkSlotTiming } from '@domain/checkSlotTiming.js';
import { insertStep } from '@domain/insertStep.js';
import { openingHoursOfDay, placeOpeningHours } from '@domain/openingHours.js';
import { toMinutes } from '@domain/time.js';
import { illustrationForCategory } from '../../../illustrations/index.jsx';
import { usePlaceName } from '../../../i18n/usePlaceName.js';
import Badge from '../../ui/Badge.jsx';
import BottomSheet from '../../ui/BottomSheet.jsx';
import Button from '../../ui/Button.jsx';
import FieldError from '../../ui/FieldError.jsx';
import Photo from '../../ui/Photo.jsx';
import RestaurantDetails from '../RestaurantDetails.jsx';
import { TimeSelect, useWarningText } from '../TimeEditorDialog.jsx';
import TravelTime from '../TravelTime.jsx';

/**
 * Fiche d'un lieu du parcours « + Ajouter une étape » (panneau du bas) :
 * photo et crédit, horaires (et, pour un restaurant, téléphone et site),
 * heures de début et de fin modifiables (durée conseillée pré-remplie),
 * avertissements en direct (checkSlotTiming, comme une étape personnelle),
 * bouton « Ajouter à HH:mm ». Un lieu déjà au programme ne peut pas être
 * ajouté une seconde fois.
 * @param {{
 *   trip: object, dayIndex: number, rules: any, type: string, item: import('@domain/listCandidates.js').CandidateItem,
 *   initial: { start: string, end: string }, dayName: (date: string) => string,
 *   blockingError?: { code: string, name?: string } | null,
 *   onAdd: (step: object) => void, onClose: () => void
 * }} props
 */
export default function PlaceDetailsSheet({ trip, dayIndex, rules, type, item, initial, dayName, blockingError, onAdd, onClose }) {
  const { t } = useTranslation();
  const { placeName } = usePlaceName();
  const warningText = useWarningText();
  const [start, setStart] = useState(initial.start);
  const [end, setEnd] = useState(initial.end);
  const { place, planned } = item;
  const day = trip.days[dayIndex];
  const countryCode = trip.destination.countryCode;
  const name = placeName(place);
  const invalid = toMinutes(end) <= toMinutes(start);

  // Avertissements à la position de l'étape (durée, trajets, horaires, pluie, fin tardive).
  const preview = invalid ? null : makePlaceStep({ id: 'draft', type, place, start, end, badges: item.badges }, rules);
  const placed = preview ? insertStep(day.steps, preview, { mode: trip.mode }, rules) : null;
  const check = placed && !placed.error ? checkSlotTiming({ day: { ...day, steps: placed.steps }, index: placed.index, start, end, mode: trip.mode, countryCode }, rules) : null;
  const overlaps = check?.warnings.some((w) => w.code.startsWith('OVERLAP')) ?? false;
  const warnings = [...(overlaps ? [{ code: 'WILL_REPLAN' }] : []), ...(check?.warnings.filter((w) => !w.code.startsWith('OVERLAP')) ?? [])];

  const hours = place.category !== 'restaurant' ? openingHoursOfDay(placeOpeningHours(place), { date: day.date, lat: place.lat, lon: place.lon, countryCode }) : null;

  return (
    <BottomSheet
      title={name}
      onClose={onClose}
      footer={
        <Button icon={Plus} disabled={Boolean(planned) || invalid} onClick={() => onAdd(makePlaceStep({ id: crypto.randomUUID(), type, place, start, end, badges: item.badges }, rules))}>
          {t('addStep.addAt', { time: start })}
        </Button>
      }
    >
      <Photo image={place.image} illustration={illustrationForCategory(place.category)} alt={t('image.alt', { name })} className="aspect-[16/9] w-full rounded-2xl" credit="inline" />
      <p className="text-ink-muted">
        {t(`categories.${place.category}`)} · <TravelTime minutes={item.travelMin} mode={trip.mode} />
      </p>
      {place.certification && <Badge tone="accent">{t(`certifications.${place.certification}`)}</Badge>}
      {place.description && <p>{place.description}</p>}

      {place.food ? (
        <RestaurantDetails place={place} date={day.date} countryCode={countryCode} badges={item.badges} />
      ) : (
        hours && <p>{t('addStep.hours', { hours })}</p>
      )}

      {planned && (
        <p role="note" className="flex items-start gap-2 rounded-xl bg-secondary-soft px-3 py-2 font-medium text-secondary-on-soft">
          <CalendarCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t('addStep.plannedNote', { day: dayName(planned.date) })}
        </p>
      )}

      {blockingError && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 font-medium text-danger-on-soft">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t(`personal.errors.${blockingError.code}`, { name: blockingError.name ?? '' })}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <TimeSelect id="add-start" label={t('timing.start')} value={start} onChange={setStart} />
        <TimeSelect id="add-end" label={t('timing.end')} value={end} onChange={setEnd} />
      </div>
      <FieldError id="add-end-error">{invalid && t('timing.INVALID')}</FieldError>
      <div role="status" aria-live="polite" className="space-y-2">
        {warnings.map((w) => (
          <p key={w.code} className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 font-medium text-warning-on-soft">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {w.code === 'WILL_REPLAN' ? t('personal.willReplan') : warningText(w)}
          </p>
        ))}
      </div>
    </BottomSheet>
  );
}
