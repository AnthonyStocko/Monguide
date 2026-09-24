import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { countryInfo } from '@domain/config/countries.js';
import { LUNCH_OPTIONS, PROFILES } from '@domain/model.js';
import { includesRestaurants } from '@domain/tripDraft.js';
import ChoiceGroup from '../ui/ChoiceGroup.jsx';
import Switch from '../ui/Switch.jsx';

/**
 * Étape 5 : profil d'exploration, pause déjeuner et préférences (si les
 * restaurants sont inclus).
 * @param {{ draft: object, update: (patch: object) => void, errors: Record<string, string> }} props
 */
export default function ProfileStep({ draft, update, errors }) {
  const { t } = useTranslation();
  // Hors de France, les données du patrimoine sont plus ou moins riches selon les pays.
  const outsideFrance = countryInfo(draft.destination?.countryCode)?.provider !== 'fr';
  const setPref = (key) => (value) => update({ prefs: { ...draft.prefs, [key]: value } });

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <ChoiceGroup
          name="profile"
          legend={t('tripForm.profile.question')}
          options={PROFILES.map((p) => ({
            value: p,
            label: t(`profiles.${p}.label`),
            description: t(`profiles.${p}.${p === 'certified' && outsideFrance ? 'descriptionEu' : 'description'}`)
          }))}
          value={draft.profile}
          onChange={(profile) => update({ profile })}
          error={errors.profile && t(`tripForm.errors.${errors.profile}`)}
        />
        {outsideFrance && (
          <p className="flex items-start gap-2 text-ink-muted">
            <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {t('tripForm.profile.dataVaries')}
          </p>
        )}
      </div>

      <ChoiceGroup
        name="lunch"
        legend={t('tripForm.profile.lunch')}
        layout="row"
        options={LUNCH_OPTIONS.map((l) => ({ value: l, label: t(`lunch.${l}`) }))}
        value={draft.lunch}
        onChange={(lunch) => update({ lunch })}
        error={errors.lunch && t(`tripForm.errors.${errors.lunch}`)}
      />

      {includesRestaurants(draft.lunch) && (
        <fieldset className="space-y-1">
          <legend className="text-lg font-semibold">{t('tripForm.profile.prefs')}</legend>
          <Switch id="pref-vegetarian" label={t('tripForm.profile.vegetarian')} checked={draft.prefs.vegetarian} onChange={setPref('vegetarian')} />
          <Switch id="pref-wheelchair" label={t('tripForm.profile.wheelchair')} checked={draft.prefs.wheelchair} onChange={setPref('wheelchair')} />
          <p className="text-ink-muted">{t('tripForm.profile.prefsSource')}</p>
        </fieldset>
      )}
    </div>
  );
}
