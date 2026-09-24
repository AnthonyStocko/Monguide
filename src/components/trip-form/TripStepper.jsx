import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { generateTrip } from '../../services/dataApi.js';
import { todayIn } from '@domain/dates.js';
import { STEPS, buildTrip, firstInvalidStep, validateStep } from '@domain/tripDraft.js';
import { useConfig } from '../../hooks/useConfig.js';
import { useTripDraft } from '../../hooks/useTripDraft.js';
import { saveTrip } from '../../services/tripsStore.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import DatesStep from './DatesStep.jsx';
import DestinationStep from './DestinationStep.jsx';
import GenerationProgress from './GenerationProgress.jsx';
import LodgingStep from './LodgingStep.jsx';
import ProfileStep from './ProfileStep.jsx';
import StepProgress from './StepProgress.jsx';
import SummaryStep from './SummaryStep.jsx';
import TransportStep from './TransportStep.jsx';

const STEP_COMPONENTS = {
  destination: DestinationStep,
  dates: DatesStep,
  lodging: LodgingStep,
  transport: TransportStep,
  profile: ProfileStep,
  summary: SummaryStep
};

/**
 * Formulaire de création de séjour en 6 étapes : validation à chaque étape,
 * saisie conservée (IndexedDB) si l'utilisateur quitte l'onglet.
 * @param {{ onCreated: (trip: object) => void }} props
 */
export default function TripStepper({ onCreated }) {
  const { t, i18n } = useTranslation();
  const { rules } = useConfig().config;
  const { draft, update, reset } = useTripDraft(rules);
  const [showErrors, setShowErrors] = useState(false);
  const [generation, setGeneration] = useState({ status: 'idle' });
  // Incrémenté à chaque refus : le focus va au message d'erreur une fois celui-ci affiché.
  const [errorTick, setErrorTick] = useState(0);
  const headingRef = useRef(null);
  const alertRef = useRef(null);
  const previousIndex = useRef(null);

  const index = draft?.step ?? 0;
  const stepName = STEPS[index];
  // "Aujourd'hui" dans le fuseau de la destination (celui de l'appareil tant qu'elle n'est pas choisie).
  const today = todayIn(draft?.destination?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone);
  const ctx = { rules, today };
  const errors = draft && showErrors ? validateStep(stepName, draft, ctx) : {};
  const errorCount = Object.keys(errors).length;

  // Au changement d'étape (pas au chargement), le focus va au titre de l'étape (clavier, lecteur d'écran).
  useEffect(() => {
    if (!draft) return;
    if (previousIndex.current !== null && previousIndex.current !== index) headingRef.current?.focus();
    previousIndex.current = index;
  }, [index, draft]);

  useEffect(() => {
    if (errorTick) alertRef.current?.focus();
  }, [errorTick]);

  if (!draft) return <Skeleton className="h-64 w-full" />;

  const goTo = (i) => {
    setShowErrors(false);
    update({ step: i });
  };

  const next = () => {
    if (Object.keys(validateStep(stepName, draft, ctx)).length) {
      setShowErrors(true);
      setErrorTick((n) => n + 1);
      return;
    }
    goTo(index + 1);
  };

  const generate = async () => {
    const invalid = firstInvalidStep(draft, ctx);
    if (invalid >= 0) {
      setShowErrors(true);
      setErrorTick((n) => n + 1);
      return;
    }
    setGeneration({ status: 'loading' });
    try {
      const request = buildTrip(draft, { id: crypto.randomUUID(), now: new Date().toISOString(), makeId: () => crypto.randomUUID() });
      const { trip, warnings } = await generateTrip(request, i18n.resolvedLanguage);
      await saveTrip(trip);
      await reset();
      setGeneration({ status: 'idle' });
      onCreated({ trip, warnings });
    } catch (error) {
      // Le brouillon est conservé : l'utilisateur peut réessayer.
      setGeneration({ status: 'error', error });
    }
  };

  if (generation.status === 'loading') return <GenerationProgress />;

  const StepComponent = STEP_COMPONENTS[stepName];
  const isLast = index === STEPS.length - 1;

  return (
    <Card as="section" aria-labelledby="step-title" className="space-y-5">
      <StepProgress index={index} />
      <h2 id="step-title" ref={headingRef} tabIndex={-1} className="text-2xl font-bold">
        {t(`tripForm.steps.${stepName}`)}
      </h2>

      {errorCount > 0 && (
        <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl bg-danger-soft px-3 py-2 font-medium text-danger-on-soft">
          {t('tripForm.errors.summary', { count: errorCount })}
        </p>
      )}

      {generation.status === 'error' && <ErrorState title={t('generation.failed')} message={t(generation.error.messageKey ?? 'errors.unknown')} onRetry={generate} />}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (isLast) generate();
          else next();
        }}
        className="space-y-6"
      >
        <StepComponent draft={draft} update={update} errors={errors} rules={rules} today={today} goTo={goTo} />

        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" icon={ArrowLeft} onClick={() => goTo(index - 1)} disabled={index === 0} className="min-h-14">
            {t('tripForm.previous')}
          </Button>
          {isLast ? (
            <Button type="submit" icon={Sparkles} className="min-h-14">
              {t('tripForm.generate')}
            </Button>
          ) : (
            <Button type="submit" className="min-h-14">
              {t('tripForm.next')}
              <ArrowRight aria-hidden="true" className="size-6" />
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
