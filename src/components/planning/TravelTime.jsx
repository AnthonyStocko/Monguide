import { useId } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Temps de trajet estimé, toujours précédé de "≈", avec l'explication en
 * info-bulle (title) et lue par les lecteurs d'écran (aria-describedby).
 * @param {{ minutes: number, mode: string, label?: string }} props label : texte avant la durée
 */
export default function TravelTime({ minutes, mode, label }) {
  const { t } = useTranslation();
  const id = useId();
  const text = t('planning.travelDuration', { minutes, mode: t(`planning.modeSuffix.${mode}`) });
  return (
    <span className="inline-flex flex-wrap items-baseline gap-1">
      {label && <span>{label}</span>}
      <abbr title={t('planning.estimateTooltip')} aria-describedby={id} className="cursor-help no-underline">
        ≈ {text}
      </abbr>
      <span id={id} className="sr-only">
        {t('planning.estimateTooltip')}
      </span>
    </span>
  );
}
