import { CloudSun } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { addDays, isValidDate } from '@domain/dates.js';
import { beyondForecast, tripNights } from '@domain/tripDraft.js';
import FieldError from '../ui/FieldError.jsx';

function DateField({ id, label, value, min, max, onChange, error }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block font-medium">
        {label}
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`min-h-12 w-full rounded-xl border-2 bg-surface px-3 text-base ${error ? 'border-danger-on-soft' : 'border-ink-muted'}`}
      />
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

/**
 * Étape 2 : dates d'arrivée et de départ (1 à 7 jours) et voyageurs.
 * @param {{ draft: object, update: (patch: object) => void, errors: Record<string, string>, rules: any, today: string }} props
 */
export default function DatesStep({ draft, update, errors, rules, today }) {
  const { t } = useTranslation();
  const err = (key) => errors[key] && t(`tripForm.errors.${errors[key]}`, { max: rules.trip.maxDays, maxTravelers: rules.trip.maxTravelers });
  const nights = tripNights(draft.startDate, draft.endDate).length;
  // Pendant la saisie au clavier, la date peut être incomplète ou intermédiaire (année 0002…).
  const validStart = isValidDate(draft.startDate);

  const setStart = (startDate) => {
    const patch = { startDate, nightLodgings: [] };
    // Départ proposé le lendemain si aucun départ n'est saisi ou s'il précède l'arrivée. Pendant la
    // saisie au clavier, le champ passe par des dates intermédiaires (année 0002…) : ignorées.
    const complete = isValidDate(startDate) && startDate >= today;
    if (complete && (!draft.endDate || draft.endDate < startDate)) patch.endDate = addDays(startDate, 1);
    update(patch);
  };

  return (
    <div className="space-y-5">
      <p className="text-ink-muted">{t('tripForm.dates.hint', { max: rules.trip.maxDays })}</p>
      <DateField id="startDate" label={t('tripForm.dates.start')} value={draft.startDate} min={today} onChange={setStart} error={err('startDate')} />
      <DateField
        id="endDate"
        label={t('tripForm.dates.end')}
        value={draft.endDate}
        min={validStart ? draft.startDate : today}
        max={validStart ? addDays(draft.startDate, rules.trip.maxDays - 1) : undefined}
        onChange={(endDate) => update({ endDate, nightLodgings: [] })}
        error={err('endDate')}
      />
      {draft.startDate && draft.endDate && !errors.endDate && (
        <p aria-live="polite">{t('tripForm.dates.summary', { count: nights })}</p>
      )}
      {beyondForecast(draft.endDate, today, rules) && (
        <p className="flex items-start gap-2 rounded-xl bg-secondary-soft px-3 py-2 text-secondary-on-soft">
          <CloudSun aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t('tripForm.dates.weatherLater')}
        </p>
      )}
      <div className="space-y-1">
        <label htmlFor="travelers" className="block font-medium">
          {t('tripForm.dates.travelers')}
        </label>
        <input
          id="travelers"
          type="number"
          inputMode="numeric"
          min={1}
          max={rules.trip.maxTravelers}
          step={1}
          value={Number.isFinite(draft.travelers) ? draft.travelers : ''}
          onChange={(e) => update({ travelers: e.target.value === '' ? Number.NaN : Number(e.target.value) })}
          aria-invalid={errors.travelers ? true : undefined}
          aria-describedby={errors.travelers ? 'travelers-error' : undefined}
          className={`min-h-12 w-32 rounded-xl border-2 bg-surface px-3 text-base ${errors.travelers ? 'border-danger-on-soft' : 'border-ink-muted'}`}
        />
        <FieldError id="travelers-error">{err('travelers')}</FieldError>
      </div>
    </div>
  );
}
