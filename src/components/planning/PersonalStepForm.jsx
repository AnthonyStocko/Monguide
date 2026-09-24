import { useState } from 'react';
import { MapPin, TriangleAlert, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { checkSlotTiming } from '@domain/checkSlotTiming.js';
import { insertStep } from '@domain/insertStep.js';
import { makePersonalStep, PERSONAL_SUGGESTIONS, validatePersonalStep } from '@domain/personalStep.js';
import LodgingPicker from '../trip-form/LodgingPicker.jsx';
import Button from '../ui/Button.jsx';
import ChoiceGroup from '../ui/ChoiceGroup.jsx';
import Dialog from '../ui/Dialog.jsx';
import FieldError from '../ui/FieldError.jsx';
import { TimeSelect, useWarningText } from './TimeEditorDialog.jsx';

/**
 * Formulaire d'une étape personnelle (panneau plein écran) : titre libre
 * avec suggestions, lieu facultatif (adresse précise, position, ou appui
 * long sur la carte), début et fin (mêmes sélecteurs et avertissements que
 * le réglage d'un horaire), intérieur ou extérieur, note.
 * @param {{
 *   trip: object, dayIndex: number, rules: any,
 *   step?: object, draft?: object, defaultStart: string, defaultEnd: string,
 *   blockingError?: { code: string, name?: string } | null,
 *   onSubmit: (step: object) => void,
 *   onDelete?: () => void,
 *   onClose: () => void
 * }} props step : étape modifiée ; draft : saisie à reprendre (retour depuis le panneau "Planning réajusté")
 */
export default function PersonalStepForm({ trip, dayIndex, rules, step, draft: resumed, defaultStart, defaultEnd, blockingError, onSubmit, onDelete, onClose }) {
  const { t } = useTranslation();
  const warningText = useWarningText();
  const initial = resumed ?? step;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [start, setStart] = useState(initial?.start ?? defaultStart);
  const [end, setEnd] = useState(initial?.end ?? defaultEnd);
  const [indoor, setIndoor] = useState(initial ? (initial.indoor ? 'indoor' : 'outdoor') : 'indoor');
  const [note, setNote] = useState(initial?.note ?? '');
  const [location, setLocation] = useState(
    initial?.place ? { address: initial.place.address, lat: initial.place.lat, lon: initial.place.lon, ...(initial.place.name !== initial.title ? { name: initial.place.name } : {}) } : null
  );
  const [showErrors, setShowErrors] = useState(false);

  const day = trip.days[dayIndex];
  const errors = validatePersonalStep({ title, start, end }, rules);
  const preview = makePersonalStep({ id: step?.id ?? 'draft', title: title || '…', note, start, end: errors.end ? start : end, indoor: indoor === 'indoor', location });
  // Avertissements de la phase 5 (durée, trajets, pluie, fin tardive) calculés à la position de l'étape.
  const placed = errors.end ? null : insertStep(day.steps, preview, { mode: trip.mode }, rules);
  const check = placed && !placed.error ? checkSlotTiming({ day: { ...day, steps: placed.steps }, index: placed.index, start, end, mode: trip.mode, countryCode: trip.destination.countryCode }, rules) : null;
  const overlaps = check?.warnings.some((w) => w.code.startsWith('OVERLAP')) ?? false;
  const warnings = [...(overlaps ? [{ code: 'WILL_REPLAN' }] : []), ...(check?.warnings.filter((w) => !w.code.startsWith('OVERLAP')) ?? [])];

  const submit = (e) => {
    e?.preventDefault();
    if (Object.keys(errors).length) {
      setShowErrors(true);
      return;
    }
    onSubmit(makePersonalStep({ id: step?.id ?? resumed?.id ?? crypto.randomUUID(), title, note, start, end, indoor: indoor === 'indoor', location }));
  };

  const max = rules.personalStep.titleMaxLength;
  return (
    <Dialog
      fullScreen
      title={step ? t('personal.editTitle') : t('personal.addTitle')}
      onClose={onClose}
      footer={
        <>
          {onDelete ? (
            <Button variant="secondary" onClick={onDelete}>
              {t('personal.delete')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
          )}
          <Button onClick={submit}>{step ? t('personal.save') : t('personal.add')}</Button>
        </>
      }
    >
      <form noValidate onSubmit={submit} className="space-y-5">
        {blockingError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 font-medium text-danger-on-soft">
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {t(`personal.errors.${blockingError.code}`, { name: blockingError.name ?? '' })}
          </p>
        )}

        <div className="space-y-2">
          <label htmlFor="personal-title" className="block font-medium">
            {t('personal.titleLabel')}
          </label>
          <input
            id="personal-title"
            type="text"
            value={title}
            maxLength={max}
            onChange={(e) => setTitle(e.target.value)}
            aria-invalid={showErrors && errors.title ? true : undefined}
            aria-describedby="personal-title-count personal-title-error"
            className="min-h-12 w-full rounded-xl border-2 border-ink-muted bg-surface px-3 text-base"
          />
          <p id="personal-title-count" className="text-ink-muted">
            {t('personal.titleCount', { count: title.length, max })}
          </p>
          <FieldError id="personal-title-error">{showErrors && errors.title && t(`personal.errors.${errors.title}`, { max })}</FieldError>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('personal.suggestionsLabel')}>
            {PERSONAL_SUGGESTIONS.map((code) => (
              <Button key={code} variant="ghost" onClick={() => setTitle(t(`personal.suggestions.${code}`))} aria-pressed={title === t(`personal.suggestions.${code}`)}>
                {t(`personal.suggestions.${code}`)}
              </Button>
            ))}
          </div>
        </div>

        <section aria-labelledby="personal-place-title" className="space-y-2">
          <h3 id="personal-place-title" className="text-lg font-semibold">
            {t('personal.placeTitle')}
          </h3>
          <p className="text-ink-muted">{t('personal.placeHint')}</p>
          <LodgingPicker
            idPrefix="personal-place"
            value={location}
            onChange={setLocation}
            destination={location ?? step?.place ?? trip.destination}
            searchLabel={t('personal.placeSearch')}
            icon={MapPin}
            longPress
            labels={{
              selected: t('personal.placeSelected'),
              hint: t('personal.placeSearchHint'),
              placeholder: t('personal.placePlaceholder'),
              chooseOnMap: t('personal.chooseOnMap'),
              mapHint: t('personal.mapHint'),
              mapLabel: t('personal.mapLabel'),
              name: t('personal.placeName'),
              namePlaceholder: t('personal.placeNamePlaceholder')
            }}
          />
          {location ? (
            <Button variant="ghost" icon={X} onClick={() => setLocation(null)}>
              {t('personal.removePlace')}
            </Button>
          ) : (
            <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 font-medium text-warning-on-soft">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              {t('personal.travelUnknown')}
            </p>
          )}
        </section>

        <div className="grid grid-cols-2 gap-3">
          <TimeSelect id="personal-start" label={t('timing.start')} value={start} onChange={setStart} />
          <TimeSelect id="personal-end" label={t('timing.end')} value={end} onChange={setEnd} />
        </div>
        <FieldError id="personal-end-error">{errors.end && t('timing.INVALID')}</FieldError>
        <div role="status" aria-live="polite" className="space-y-2">
          {warnings.map((w) => (
            <p key={w.code} className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 font-medium text-warning-on-soft">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              {w.code === 'WILL_REPLAN' ? t('personal.willReplan') : warningText(w)}
            </p>
          ))}
        </div>

        <ChoiceGroup
          name="personal-indoor"
          legend={t('personal.indoorLegend')}
          hint={t('personal.indoorHint')}
          options={['indoor', 'outdoor'].map((v) => ({ value: v, label: t(`personal.${v}`) }))}
          value={indoor}
          onChange={setIndoor}
        />

        <div className="space-y-1">
          <label htmlFor="personal-note" className="block font-medium">
            {t('personal.note')}
          </label>
          <textarea
            id="personal-note"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-xl border-2 border-ink-muted bg-surface px-3 py-2 text-base"
          />
        </div>
      </form>
    </Dialog>
  );
}
