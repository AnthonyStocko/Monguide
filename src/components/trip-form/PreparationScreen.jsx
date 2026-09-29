import { useMemo, useState } from 'react';
import { CircleAlert, Lightbulb, X } from 'lucide-react';
import { m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import Illustration from '../../illustrations/index.jsx';
import { useMotionAllowed, variants } from '../../ui/motion.js';
import ValidatedCheck from '../../ui/ValidatedCheck.jsx';
import Button from '../ui/Button.jsx';

/**
 * État d'une étape, d'après les VRAIS événements du serveur (generate en flux,
 * docs/api.md) : pending (cercle pointillé), running (anneau qui tourne,
 * indicateur de chargement), done (coche), failed (source indisponible).
 */
function StepIcon({ status }) {
  if (status === 'done') return <ValidatedCheck status="done" appearOnMount />;
  if (status === 'failed') return <CircleAlert aria-hidden="true" className="size-7 text-warning-on-soft" />;
  if (status === 'running') {
    return (
      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-7 motion-ok:animate-spin">
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-secondary-soft)" strokeWidth="3" />
        <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="var(--color-secondary)" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }
  return <span aria-hidden="true" className="block size-7 rounded-full border-2 border-dashed border-line-strong" />;
}

/**
 * Écran "Préparation du séjour" pendant la génération. steps = null tant que
 * le serveur n'a envoyé aucun événement (ou si le flux est indisponible) :
 * barre de progression indéterminée, sans étapes cochées. Sinon, une ligne
 * par étape, cochée à la réception de son événement ; barre = part des
 * étapes finies. Astuce d'utilisation en bas, bouton "Annuler".
 * @param {{ destination: string, days: number, radiusKm: number, steps: { name: string, status: string }[] | null, onCancel: () => void }} props
 */
export default function PreparationScreen({ destination, days, radiusKm, steps, onCancel }) {
  const { t } = useTranslation();
  const allowed = useMotionAllowed();
  const tips = t('preparation.tips', { returnObjects: true });
  // Une astuce tirée au hasard, gardée pendant toute la préparation.
  const [tip] = useState(() => (Array.isArray(tips) ? tips[Math.floor(Math.random() * tips.length)] : ''));
  const finished = steps ? steps.filter((s) => s.status === 'done' || s.status === 'failed').length : 0;
  const ratio = steps ? finished / steps.length : 0;
  const latest = useMemo(() => {
    const active = steps?.filter((s) => s.status !== 'pending');
    const last = active?.at(-1);
    return last ? t(`preparation.steps.${last.name}.${last.status}`, { km: radiusKm }) : t('preparation.starting');
  }, [steps, t, radiusKm]);

  return (
    <section aria-labelledby="preparation-title" className="flex flex-col gap-5">
      <m.div variants={variants.appear} initial={allowed ? 'hidden' : false} animate="visible">
        <Illustration name="onboardingPrepare" className="aspect-[3/2] w-full rounded-3xl" />
      </m.div>
      <div className="space-y-1">
        <h2 id="preparation-title" className="text-3xl">
          {t('preparation.title')}
        </h2>
        <p className="text-ink-muted">{t('preparation.subtitle', { destination, count: days })}</p>
      </div>

      {steps ? (
        <div
          role="progressbar"
          aria-label={t('preparation.progressLabel')}
          aria-valuemin={0}
          aria-valuemax={steps.length}
          aria-valuenow={finished}
          aria-valuetext={t('preparation.progressText', { done: finished, total: steps.length })}
          className="h-2.5 overflow-hidden rounded-full bg-line"
        >
          <div
            className="h-full rounded-full bg-primary-strong motion-ok:transition-transform motion-ok:duration-300"
            style={{ transform: `translateX(${ratio * 100 - 100}%)` }}
          />
        </div>
      ) : (
        // Flux indisponible (ou pas encore commencé) : progression indéterminée, aucune étape cochée.
        <div role="progressbar" aria-label={t('preparation.progressLabel')} aria-valuetext={t('preparation.indeterminate')} className="relative h-2.5 overflow-hidden rounded-full bg-line">
          <div className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary-strong motion-ok:animate-[indeterminate_1.4s_ease-in-out_infinite]" />
        </div>
      )}

      {/* Annonce polie de la dernière étape changée (lecteurs d'écran). */}
      <p role="status" aria-live="polite" className="sr-only">
        {latest}
      </p>

      {steps && (
        <ol className="space-y-4">
          {steps.map((step) => (
            <li key={step.name} className="flex items-center gap-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-surface shadow-sm">
                <StepIcon status={step.status} />
              </span>
              <span className="min-w-0">
                <span className={`block font-semibold ${step.status === 'pending' ? 'text-ink-muted' : 'text-ink'}`}>
                  {t(`preparation.steps.${step.name}.${step.status}`, { km: radiusKm })}
                </span>
                <span className="block text-ink-muted">{t(`preparation.steps.${step.name}.detail`, { km: radiusKm })}</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      {tip && (
        <p className="flex items-start gap-3 rounded-2xl bg-surface p-4 shadow-sm">
          <Lightbulb aria-hidden="true" className="mt-0.5 size-6 shrink-0 text-accent-rust" />
          <span>{tip}</span>
        </p>
      )}

      <Button variant="secondary" icon={X} onClick={onCancel} className="w-full">
        {t('common.cancel')}
      </Button>
    </section>
  );
}
