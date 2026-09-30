import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { countryInfo } from '@domain/config/countries.js';
import { DINNER_OPTIONS, LUNCH_OPTIONS, PROFILES } from '@domain/model.js';
import { includesRestaurants } from '@domain/tripDraft.js';
import { hasWish, toggleWish, WISH_SUGGESTIONS } from '@domain/wishes.js';
import { useConfig } from '../../hooks/useConfig.js';
import { useAiConsent, useAiReviewAvailable } from '../../services/aiConsent.js';
import ChoiceGroup from '../ui/ChoiceGroup.jsx';
import Chip from '../ui/Chip.jsx';
import FieldError from '../ui/FieldError.jsx';
import Switch from '../ui/Switch.jsx';

/**
 * Étape 5 : profil d'exploration, pause déjeuner, dîner (restaurant proposé
 * ou libre), préférences (si les restaurants sont inclus) et « Vos envies »
 * (texte libre pour la relecture par une IA ; masqué si elle est désactivée).
 * @param {{ draft: object, update: (patch: object) => void, errors: Record<string, string> }} props
 */
export default function ProfileStep({ draft, update, errors }) {
  const { t } = useTranslation();
  // Hors de France, les données du patrimoine sont plus ou moins riches selon les pays.
  const outsideFrance = countryInfo(draft.destination?.countryCode)?.provider !== 'fr';
  const setPref = (key) => (value) => update({ prefs: { ...draft.prefs, [key]: value } });
  const { rules } = useConfig().config;
  const max = rules.ai.wishesMaxLength;
  const wishes = draft.wishes ?? '';
  // Masqué si la relecture est désactivée ou refusée (consentement ; encore demandé : affiché).
  const aiConsent = useAiConsent();
  const aiAvailable = useAiReviewAvailable(rules);
  const showWishes = aiAvailable === true && aiConsent !== false;

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

      <ChoiceGroup
        name="dinner"
        legend={t('tripForm.profile.dinner')}
        options={DINNER_OPTIONS.map((d) => ({ value: d, label: t(`dinner.${d}`), ...(d === 'free' ? { description: t('tripForm.profile.dinnerHint') } : {}) }))}
        value={draft.dinner}
        onChange={(dinner) => update({ dinner })}
        error={errors.dinner && t(`tripForm.errors.${errors.dinner}`)}
      />

      {includesRestaurants(draft.lunch, draft.dinner) && (
        <fieldset className="space-y-1">
          <legend className="text-lg font-semibold">{t('tripForm.profile.prefs')}</legend>
          <Switch id="pref-vegetarian" label={t('tripForm.profile.vegetarian')} checked={draft.prefs.vegetarian} onChange={setPref('vegetarian')} />
          <Switch id="pref-wheelchair" label={t('tripForm.profile.wheelchair')} checked={draft.prefs.wheelchair} onChange={setPref('wheelchair')} />
          <p className="text-ink-muted">{t('tripForm.profile.prefsSource')}</p>
        </fieldset>
      )}

      {showWishes && (
        <div className="space-y-2">
          <label htmlFor="trip-wishes" className="block text-lg font-semibold">
            {t('tripForm.profile.wishes')}
          </label>
          <textarea
            id="trip-wishes"
            rows={3}
            value={wishes}
            maxLength={max}
            onChange={(e) => update({ wishes: e.target.value })}
            aria-invalid={errors.wishes ? true : undefined}
            aria-describedby="trip-wishes-count trip-wishes-notice trip-wishes-error"
            className="w-full rounded-xl border-2 border-ink-muted bg-surface px-3 py-2 text-base"
          />
          <p id="trip-wishes-count" className="text-ink-muted">
            {t('tripForm.profile.wishesCount', { count: wishes.length, max })}
          </p>
          <FieldError id="trip-wishes-error">{errors.wishes && t(`tripForm.errors.${errors.wishes}`, { max })}</FieldError>
          <div role="group" aria-label={t('tripForm.profile.wishSuggestionsLabel')} className="flex flex-wrap gap-2">
            {WISH_SUGGESTIONS.map((key) => {
              const label = t(`tripForm.profile.wishSuggestions.${key}`);
              return (
                <Chip key={key} selected={hasWish(wishes, label)} onChange={() => update({ wishes: toggleWish(wishes, label, rules) })}>
                  {label}
                </Chip>
              );
            })}
          </div>
          <p id="trip-wishes-notice" className="flex items-start gap-2 text-ink-muted">
            <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
            {t('tripForm.profile.wishesNotice')}
          </p>
        </div>
      )}
    </div>
  );
}
