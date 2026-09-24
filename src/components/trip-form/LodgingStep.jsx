import { useState } from 'react';
import { Pencil, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { effectiveNightLodgings, farLodgings, tripNights } from '@domain/tripDraft.js';
import { useFormat } from '../../i18n/useFormat.js';
import Button from '../ui/Button.jsx';
import ChoiceGroup from '../ui/ChoiceGroup.jsx';
import FieldError from '../ui/FieldError.jsx';
import LodgingPicker from './LodgingPicker.jsx';

/**
 * Étape 3 : "Où dormez-vous ?" (facultatif) : même hébergement tout le
 * séjour, un hébergement par nuit, ou pas encore connu.
 * @param {{ draft: object, update: (patch: object) => void, errors: Record<string, string>, rules: any }} props
 */
export default function LodgingStep({ draft, update, errors, rules }) {
  const { t } = useTranslation();
  const format = useFormat();
  const [editing, setEditing] = useState(0);
  const nights = tripNights(draft.startDate, draft.endDate);
  const destination = draft.destination;
  const night = (date) => format.date(`${date}T12:00:00Z`, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

  if (!nights.length) return <p>{t('tripForm.lodging.dayTrip')}</p>;

  const effective = effectiveNightLodgings(draft);
  const chosen = draft.lodgingMode === 'same' ? [draft.lodging] : draft.lodgingMode === 'multiple' ? effective : [];
  const far = farLodgings(chosen, destination, draft.radiusKm, rules);

  const setNight = (i, place) => {
    const next = [...draft.nightLodgings];
    while (next.length < nights.length) next.push(null);
    next[i] = place;
    update({ nightLodgings: next });
  };

  return (
    <div className="space-y-5">
      <ChoiceGroup
        name="lodgingMode"
        legend={t('tripForm.lodging.question')}
        hint={t('tripForm.lodging.optional')}
        options={['same', 'multiple', 'unknown'].map((m) => ({ value: m, label: t(`tripForm.lodging.modes.${m}`), description: t(`tripForm.lodging.modesHint.${m}`) }))}
        value={draft.lodgingMode}
        onChange={(lodgingMode) => update({ lodgingMode })}
        error={errors.lodgingMode && t(`tripForm.errors.${errors.lodgingMode}`)}
      />

      {draft.lodgingMode === 'same' && (
        <section aria-labelledby="lodging-same-title" className="space-y-2">
          <h3 id="lodging-same-title" className="text-lg font-semibold">
            {t('tripForm.lodging.sameTitle', { count: nights.length })}
          </h3>
          <LodgingPicker
            idPrefix="lodging-same"
            value={draft.lodging}
            onChange={(lodging) => update({ lodging })}
            destination={destination}
            error={errors.lodging && t(`tripForm.errors.${errors.lodging}`)}
          />
        </section>
      )}

      {draft.lodgingMode === 'multiple' && (
        <section aria-labelledby="lodging-multiple-title" className="space-y-2">
          <h3 id="lodging-multiple-title" className="text-lg font-semibold">
            {t('tripForm.lodging.multipleTitle')}
          </h3>
          <p className="text-ink-muted">{t('tripForm.lodging.multipleHint')}</p>
          <ol className="space-y-3">
            {nights.map((date, i) => {
              const place = effective[i];
              const inherited = !draft.nightLodgings[i] && i > 0 && place;
              const error = errors[`night-${i}`];
              return (
                <li key={date} className={`space-y-2 rounded-xl border-2 p-3 ${error ? 'border-danger-on-soft' : 'border-line'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-semibold">{t('tripForm.lodging.night', { n: i + 1, date: night(date) })}</h4>
                    {editing !== i && (
                      <Button variant="ghost" icon={Pencil} onClick={() => setEditing(i)} aria-label={t('tripForm.lodging.editNight', { n: i + 1 })}>
                        {t('tripForm.modify')}
                      </Button>
                    )}
                  </div>
                  {editing === i ? (
                    <LodgingPicker
                      idPrefix={`night-${i}`}
                      value={place}
                      onChange={(p) => setNight(i, p)}
                      destination={destination}
                      searchLabel={t('tripForm.lodging.searchNight', { n: i + 1 })}
                    />
                  ) : (
                    <p>
                      {place ? (
                        <>
                          {place.name && <span className="font-medium">{place.name} · </span>}
                          {place.address}
                          {inherited && <span className="block text-ink-muted">{t('tripForm.lodging.sameAsBefore')}</span>}
                        </>
                      ) : (
                        <span className="text-ink-muted">{t('tripForm.lodging.notChosen')}</span>
                      )}
                    </p>
                  )}
                  <FieldError id={`night-${i}-error`}>{error && t(`tripForm.errors.${error}`)}</FieldError>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {draft.lodgingMode === 'unknown' && <p className="text-ink-muted">{t('tripForm.lodging.later')}</p>}

      {far.map(({ place, km }) => (
        <p key={`${place.lat},${place.lon}`} role="status" className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-warning-on-soft">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t('tripForm.lodging.far', { km: format.number(km), destination: destination.name })}
        </p>
      ))}
    </div>
  );
}
