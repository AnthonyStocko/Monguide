import { useEffect, useRef, useState } from 'react';
import { m } from 'motion/react';
import { DURATION, EASE, useMotionAllowed, variants } from './motion.js';

/**
 * Coche d'une étape qui vient d'être validée : apparaît en "pop" puis se
 * dessine. Seulement au passage à "done" pendant l'affichage (jamais au
 * chargement d'une étape déjà terminée). Décorative : le badge "Terminée"
 * porte l'information. Animations refusées : coche affichée directement.
 * appearOnMount : afficher la coche dès le montage (étape de préparation qui
 * vient de se terminer).
 * @param {{ status: 'planned' | 'done' | 'skipped', appearOnMount?: boolean }} props
 */
export default function ValidatedCheck({ status, appearOnMount = false }) {
  const allowed = useMotionAllowed();
  const previous = useRef(appearOnMount ? null : status);
  const [justDone, setJustDone] = useState(appearOnMount && status === 'done');
  useEffect(() => {
    if (previous.current !== 'done' && status === 'done') setJustDone(true);
    if (status !== 'done') setJustDone(false);
    previous.current = status;
  }, [status]);
  if (!justDone) return null;
  return (
    <m.svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-7 shrink-0 text-primary-strong"
      variants={variants.pop}
      initial={allowed ? 'hidden' : false}
      animate="visible"
    >
      <circle cx="12" cy="12" r="11" fill="currentColor" />
      <m.path
        d="M6.5 12.5l3.5 3.5 7.5-8"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={allowed ? { pathLength: 0 } : false}
        animate={{ pathLength: 1 }}
        transition={{ duration: DURATION.standard, delay: 0.12, ease: EASE.enter }}
      />
    </m.svg>
  );
}
