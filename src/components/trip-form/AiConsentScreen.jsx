import { useEffect, useRef } from 'react';
import { Sparkles } from 'lucide-react';
import { m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import Illustration from '../../illustrations/index.jsx';
import { useMotionAllowed, variants } from '../../ui/motion.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

/**
 * Consentement à la relecture par l'assistant IA, demandé à la première
 * génération : ce que fait l'assistant, les données transmises (jamais
 * d'adresse ni d'e-mail), caractère facultatif. Choix modifiable ensuite dans
 * les réglages. Focus sur le titre à l'affichage (clavier, TalkBack).
 * @param {{ onChoose: (accepted: boolean) => void }} props
 */
export default function AiConsentScreen({ onChoose }) {
  const { t } = useTranslation();
  const allowed = useMotionAllowed();
  const headingRef = useRef(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <Card as="section" aria-labelledby="ai-consent-title" className="space-y-5">
      <m.div variants={variants.appear} initial={allowed ? 'hidden' : false} animate="visible">
        <Illustration name="onboardingPrepare" className="aspect-[5/2] w-full rounded-2xl" />
      </m.div>
      <h2 id="ai-consent-title" ref={headingRef} tabIndex={-1} className="flex items-center gap-2 text-2xl font-bold">
        <Sparkles aria-hidden="true" className="size-7 shrink-0 text-primary-strong" />
        {t('aiReview.consent.title')}
      </h2>
      <div className="space-y-3">
        {t('aiReview.consent.text', { returnObjects: true }).map((p) => (
          <p key={p}>{p}</p>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Button variant="secondary" onClick={() => onChoose(false)} className="min-h-14">
          {t('aiReview.consent.decline')}
        </Button>
        <Button icon={Sparkles} onClick={() => onChoose(true)} className="min-h-14">
          {t('aiReview.consent.accept')}
        </Button>
      </div>
    </Card>
  );
}
