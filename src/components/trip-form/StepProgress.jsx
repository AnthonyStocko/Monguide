import { useTranslation } from 'react-i18next';
import { STEPS } from '@domain/tripDraft.js';

/** Barre de progression du formulaire, annoncée par les lecteurs d'écran. */
export default function StepProgress({ index }) {
  const { t } = useTranslation();
  const label = t('tripForm.progress', { current: index + 1, total: STEPS.length, name: t(`tripForm.steps.${STEPS[index]}`) });
  return (
    <div className="space-y-1">
      <p className="text-ink-muted" aria-hidden="true">
        {label}
      </p>
      <div
        role="progressbar"
        aria-label={t('tripForm.progressLabel')}
        aria-valuemin={1}
        aria-valuemax={STEPS.length}
        aria-valuenow={index + 1}
        aria-valuetext={label}
        className="h-3 w-full overflow-hidden rounded-full bg-subtle"
      >
        <div className="h-full rounded-full bg-primary-strong transition-[width]" style={{ width: `${((index + 1) / STEPS.length) * 100}%` }} />
      </div>
    </div>
  );
}
