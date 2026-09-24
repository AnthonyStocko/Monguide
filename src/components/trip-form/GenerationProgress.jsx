import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '../../hooks/useConfig.js';
import Card from '../ui/Card.jsx';

/** Étapes affichées pendant la génération (le serveur répond en une fois). */
const PHASES = [
  { key: 'places', from: 0 },
  { key: 'weather', from: 4 },
  { key: 'planning', from: 9 },
  { key: 'finishing', from: 15 }
];

/**
 * Progression de la génération : barre et étape en cours, estimées d'après
 * le temps écoulé (le serveur ne renvoie qu'une réponse finale).
 */
export default function GenerationProgress() {
  const { t } = useTranslation();
  const { rules } = useConfig().config;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 500);
    return () => clearInterval(timer);
  }, []);

  const expected = rules.api.generateTimeoutMs / 1000;
  const percent = Math.min(95, Math.round((elapsed / expected) * 100));
  const phase = [...PHASES].reverse().find((p) => elapsed >= p.from);
  const label = t(`generation.phases.${phase.key}`);

  return (
    <Card as="section" className="space-y-4 text-center" aria-labelledby="generation-title">
      <Sparkles aria-hidden="true" className="mx-auto size-10 text-primary motion-safe:animate-pulse" />
      <h2 id="generation-title" className="text-2xl font-bold">
        {t('generation.title')}
      </h2>
      <div
        role="progressbar"
        aria-label={t('generation.title')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={label}
        className="h-3 w-full overflow-hidden rounded-full bg-subtle"
      >
        <div className="h-full rounded-full bg-primary-strong transition-[width] duration-500" style={{ width: `${percent}%` }} />
      </div>
      <p role="status" aria-live="polite" className="font-medium">
        {label}
      </p>
      <p className="text-ink-muted">{t('generation.elapsed', { seconds: Math.floor(elapsed) })}</p>
    </Card>
  );
}
