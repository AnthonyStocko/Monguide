import { Pencil } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { countryInfo } from '@domain/config/countries.js';
import { STEPS, includesRestaurants, lodgingsFromDraft, tripNights } from '@domain/tripDraft.js';
import { useFormat } from '../../i18n/useFormat.js';
import Button from '../ui/Button.jsx';
import FieldError from '../ui/FieldError.jsx';

function Section({ title, step, onEdit, error, children }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-1 border-b border-line py-3 last:border-b-0" aria-labelledby={`summary-${step}`}>
      <div className="flex items-center justify-between gap-2">
        <h3 id={`summary-${step}`} className="text-lg font-semibold">
          {title}
        </h3>
        <Button variant="ghost" icon={Pencil} onClick={() => onEdit(step)} aria-label={t('tripForm.summary.edit', { section: title })}>
          {t('tripForm.modify')}
        </Button>
      </div>
      {children}
      <FieldError id={`summary-${step}-error`}>{error}</FieldError>
    </section>
  );
}

/**
 * Étape 6 : récapitulatif modifiable (chaque section renvoie à son étape).
 * @param {{ draft: object, errors: Record<string, string>, goTo: (index: number) => void }} props
 */
export default function SummaryStep({ draft, errors, goTo }) {
  const { t, i18n } = useTranslation();
  const format = useFormat();
  const d = draft.destination;
  const country = countryInfo(d?.countryCode);
  const edit = (step) => goTo(STEPS.indexOf(step));
  const err = (step) => errors[step] && t(`tripForm.errors.${errors[step]}`);
  const date = (value) => (value ? format.date(`${value}T12:00:00Z`, { dateStyle: 'full', timeZone: 'UTC' }) : '—');
  const currencyName = country ? new Intl.DisplayNames([i18n.resolvedLanguage], { type: 'currency' }).of(country.currency) : '';
  const lodgings = lodgingsFromDraft(draft, () => '');
  const nights = tripNights(draft.startDate, draft.endDate);

  return (
    <div>
      <Section title={t('tripForm.steps.destination')} step="destination" onEdit={edit} error={err('destination')}>
        {d && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3">
            <dt className="text-ink-muted">{t('tripForm.summary.place')}</dt>
            <dd className="font-medium">{d.name}</dd>
            <dt className="text-ink-muted">{t('tripForm.summary.country')}</dt>
            <dd>{d.country}</dd>
            <dt className="text-ink-muted">{t('tripForm.summary.timezone')}</dt>
            <dd>{d.timezone}</dd>
            <dt className="text-ink-muted">{t('tripForm.summary.currency')}</dt>
            <dd>
              {currencyName} ({country?.currency})
            </dd>
            <dt className="text-ink-muted">{t('tripForm.summary.radius')}</dt>
            <dd>{t('tripForm.km', { km: draft.radiusKm })}</dd>
          </dl>
        )}
      </Section>

      <Section title={t('tripForm.steps.dates')} step="dates" onEdit={edit} error={err('dates')}>
        <p>{t('tripForm.summary.from', { date: date(draft.startDate) })}</p>
        <p>{t('tripForm.summary.to', { date: date(draft.endDate) })}</p>
        <p>
          {t('tripForm.dates.summary', { count: nights.length })} · {t('tripForm.summary.travelers', { count: draft.travelers })}
        </p>
      </Section>

      <Section title={t('tripForm.steps.lodging')} step="lodging" onEdit={edit} error={err('lodging')}>
        {!nights.length && <p>{t('tripForm.lodging.dayTrip')}</p>}
        {nights.length > 0 && lodgings.length === 0 && <p>{t('tripForm.lodging.later')}</p>}
        <ul className="space-y-1">
          {lodgings.map((l) => (
            <li key={`${l.lat},${l.lon},${l.nights[0]}`}>
              <span className="font-medium">{l.name ?? l.address}</span>
              {l.name && <span className="block">{l.address}</span>}
              <span className="block text-ink-muted">
                {t('tripForm.summary.nights', { count: l.nights.length, first: date(l.nights[0]) })}
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title={t('tripForm.steps.transport')} step="transport" onEdit={edit} error={err('transport')}>
        <p>
          {draft.mode ? t(`modes.${draft.mode}`) : '—'}
          {draft.mode === 'car' && draft.fuelType && ` · ${t(`fuels.${draft.fuelType}`)}`}
        </p>
      </Section>

      <Section title={t('tripForm.steps.profile')} step="profile" onEdit={edit} error={err('profile')}>
        <p>{t(`profiles.${draft.profile}.label`)}</p>
        <p>{t('tripForm.summary.lunch', { value: t(`lunch.${draft.lunch}`) })}</p>
        {includesRestaurants(draft.lunch) && (draft.prefs.vegetarian || draft.prefs.wheelchair) && (
          <p>
            {[draft.prefs.vegetarian && t('tripForm.profile.vegetarian'), draft.prefs.wheelchair && t('tripForm.profile.wheelchair')].filter(Boolean).join(' · ')}
          </p>
        )}
      </Section>
    </div>
  );
}
