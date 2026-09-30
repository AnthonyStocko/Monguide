import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { generateTrip } from '../../services/dataApi.js';
import { daysBetween, todayIn } from '@domain/dates.js';
import { STEPS, buildTrip, firstInvalidStep, validateStep } from '@domain/tripDraft.js';
import { useConfig } from '../../hooks/useConfig.js';
import { useTripDraft } from '../../hooks/useTripDraft.js';
import { refreshTripPhotos } from '../../services/tripImages.js';
import { hapticConfirm, hapticError } from '../../services/haptics.js';
import { saveTrip } from '../../services/tripsStore.js';
import { useMotionAllowed, variants } from '../../ui/motion.js';
import Illustration from '../../illustrations/index.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import ErrorState from '../ui/ErrorState.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import DatesStep from './DatesStep.jsx';
import DestinationStep from './DestinationStep.jsx';
import LodgingStep from './LodgingStep.jsx';
import PreparationScreen from './PreparationScreen.jsx';
import ProfileStep from './ProfileStep.jsx';
import StepProgress from './StepProgress.jsx';
import SummaryStep from './SummaryStep.jsx';
import TransportStep from './TransportStep.jsx';

/** Illustration en tête de chaque étape du formulaire (décorative). */
const STEP_ILLUSTRATIONS = {
  destination: 'onboardingPrepare',
  dates: 'onboardingFollow',
  lodging: 'lodging',
  transport: 'onboardingFree',
  profile: 'monument',
  summary: 'landscape'
};

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
  const cancelRef = useRef(null);

  const index = draft?.step ?? 0;
  const allowed = useMotionAllowed();
  // Sens du glissement entre deux étapes (+1 : suivante, -1 : précédente), stable d'un rendu à l'autre.
  const slide = useRef({ index, direction: 1 });
  if (slide.current.index !== index) slide.current = { index, direction: index > slide.current.index ? 1 : -1 };
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
    setGeneration({ status: 'loading', steps: null });
    const controller = new AbortController();
    cancelRef.current = controller;
    // Progression réelle envoyée par le serveur : start (liste des étapes), puis step (état de chacune) ;
    // review / review_done : relecture du planning, étape ajoutée seulement si elle est tentée.
    const setStep = (name, status) => setGeneration((g) => (g.steps ? { ...g, steps: g.steps.map((st) => (st.name === name ? { ...st, status } : st)) } : g));
    const onEvent = (event) => {
      if (event.event === 'start') setGeneration({ status: 'loading', steps: event.steps.map((name) => ({ name, status: 'pending' })) });
      if (event.event === 'step') setStep(event.step, event.status);
      if (event.event === 'review') setGeneration((g) => (g.steps ? { ...g, steps: [...g.steps.filter((st) => st.name !== 'review'), { name: 'review', status: 'running' }] } : g));
      // Relecture non appliquée (délai, quota…) : étape cochée quand même, sans message d'erreur.
      if (event.event === 'review_done') setStep('review', 'done');
    };
    try {
      const request = buildTrip(draft, { id: crypto.randomUUID(), now: new Date().toISOString(), makeId: () => crypto.randomUUID() });
      const { trip, warnings } = await generateTrip(request, i18n.resolvedLanguage, { onEvent, signal: controller.signal });
      await saveTrip(trip);
      // Photos demandées après la génération (jamais par elle), sans attendre.
      refreshTripPhotos(trip.id).catch(() => {});
      await reset();
      setGeneration({ status: 'idle' });
      hapticConfirm();
      onCreated({ trip, warnings });
    } catch (error) {
      // Annulé : retour au formulaire, sans message. Sinon, le brouillon est conservé : l'utilisateur peut réessayer.
      if (error?.code === 'cancelled') {
        setGeneration({ status: 'idle' });
        return;
      }
      setGeneration({ status: 'error', error });
      hapticError();
    } finally {
      cancelRef.current = null;
    }
  };

  if (generation.status === 'loading') {
    return (
      <PreparationScreen
        destination={draft.destination?.name ?? ''}
        days={draft.startDate && draft.endDate ? daysBetween(draft.startDate, draft.endDate) + 1 : 1}
        radiusKm={draft.radiusKm}
        steps={generation.steps}
        onCancel={() => cancelRef.current?.abort()}
      />
    );
  }

  const StepComponent = STEP_COMPONENTS[stepName];
  const isLast = index === STEPS.length - 1;

  return (
    <Card as="section" aria-labelledby="step-title" className="space-y-5">
      <div className="-mx-1 overflow-x-clip px-1">
        <AnimatePresence mode="wait" initial={false} custom={slide.current.direction}>
          <m.div
            key={stepName}
            custom={slide.current.direction}
            variants={variants.slide}
            initial={allowed ? 'hidden' : false}
            animate="visible"
            exit={allowed ? 'exit' : undefined}
          >
            <Illustration name={STEP_ILLUSTRATIONS[stepName]} className="aspect-[5/2] w-full rounded-2xl" />
          </m.div>
        </AnimatePresence>
      </div>
      <StepProgress index={index} />
      <h2 id="step-title" ref={headingRef} tabIndex={-1} className="text-2xl font-bold">
        {t(`tripForm.steps.${stepName}`)}
      </h2>

      {errorCount > 0 && (
        <p ref={alertRef} tabIndex={-1} role="alert" className="rounded-xl bg-danger-soft px-3 py-2 font-medium text-danger-on-soft">
          {t('tripForm.errors.summary', { count: errorCount })}
        </p>
      )}

      {generation.status === 'error' && <ErrorState title={t('generation.failed')} message={t(generation.error.messageKey ?? 'errors.unknown')} onRetry={generate} illustration={generation.error.code === 'offline' ? 'offline' : 'error'} />}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (isLast) generate();
          else next();
        }}
        className="space-y-6"
      >
        {/* Glissement horizontal entre les étapes (l'ancienne sort, la nouvelle entre du même côté que le geste). */}
        <div className="-mx-1 overflow-x-clip px-1">
          <AnimatePresence mode="wait" initial={false} custom={slide.current.direction}>
            <m.div
              key={index}
              custom={slide.current.direction}
              variants={variants.slide}
              initial={allowed ? 'hidden' : false}
              animate="visible"
              exit={allowed ? 'exit' : undefined}
            >
              <StepComponent draft={draft} update={update} errors={errors} rules={rules} today={today} goTo={goTo} />
            </m.div>
          </AnimatePresence>
        </div>

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
