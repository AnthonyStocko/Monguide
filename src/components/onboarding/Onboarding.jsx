import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { AnimatePresence, m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import Illustration from '../../illustrations/index.jsx';
import { useMotionAllowed, variants } from '../../ui/motion.js';
import Button from '../ui/Button.jsx';
import Logo from '../brand/Logo.jsx';

const SLIDES = [
  { key: 'prepare', illustration: 'onboardingPrepare' },
  { key: 'follow', illustration: 'onboardingFollow' },
  { key: 'free', illustration: 'onboardingFree' }
];

/**
 * Écrans d'accueil du premier lancement : préparer, suivre sa journée,
 * partir l'esprit libre. "Passer" à tout moment ; jamais réaffichés ensuite
 * (services/onboarding.js). Focus sur le titre à chaque écran ; glissement
 * horizontal entre les écrans (sauf animations réduites).
 * @param {{ onDone: () => void }} props
 */
export default function Onboarding({ onDone }) {
  const { t } = useTranslation();
  const allowed = useMotionAllowed();
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const headingRef = useRef(null);
  const first = useRef(true);
  const slide = SLIDES[index];
  const last = index === SLIDES.length - 1;

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [index]);

  const go = (next) => {
    setDirection(next > index ? 1 : -1);
    setIndex(next);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-canvas pt-safe pb-safe">
      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 p-5">
        <div className="flex min-h-12 items-center justify-between">
          <Logo className="h-9 w-auto" label={t('app.name')} />
          {!last && (
            <Button variant="ghost" onClick={onDone}>
              {t('onboarding.skip')}
            </Button>
          )}
        </div>

        <div className="-mx-1 flex-1 overflow-x-clip px-1">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <m.section
              key={slide.key}
              aria-labelledby="onboarding-title"
              custom={direction}
              variants={variants.slide}
              initial={allowed ? 'hidden' : false}
              animate="visible"
              exit={allowed ? 'exit' : undefined}
              className="flex flex-col gap-5"
            >
              <Illustration name={slide.illustration} className="aspect-[4/3] w-full rounded-3xl shadow-sm" />
              <p className="font-semibold text-primary-strong">{t('onboarding.progress', { current: index + 1, total: SLIDES.length })}</p>
              <h1 id="onboarding-title" ref={headingRef} tabIndex={-1} className="text-3xl leading-tight">
                {t(`onboarding.${slide.key}.title`)}
              </h1>
              <p className="text-lg text-ink-muted">{t(`onboarding.${slide.key}.text`)}</p>
            </m.section>
          </AnimatePresence>
        </div>

        <div aria-hidden="true" className="flex justify-center gap-2">
          {SLIDES.map((s, i) => (
            <span key={s.key} className={`h-2.5 rounded-full ${i === index ? 'w-7 bg-primary-strong' : 'w-2.5 bg-line-strong'}`} />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => go(index - 1)} disabled={index === 0} className="min-h-14">
            {t('onboarding.previous')}
          </Button>
          <Button onClick={() => (last ? onDone() : go(index + 1))} className="min-h-14">
            {last ? t('onboarding.start') : t('onboarding.next')}
            <ArrowRight aria-hidden="true" className="size-6" />
          </Button>
        </div>
      </div>
    </div>
  );
}
