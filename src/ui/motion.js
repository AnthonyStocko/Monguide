import { useEffect, useState, useSyncExternalStore } from 'react';
import { useReducedMotion } from 'motion/react';
import { isAppReducedMotion, onReducedMotionChange } from '../services/motion.js';

/**
 * Système d'animation commun (bibliothèque motion, import "motion/react").
 * Règles : transform et opacity uniquement (jamais width, height, top ou
 * left), 20 éléments animés à la fois au plus, will-change laissé à motion
 * (posé seulement pendant l'animation). Animations refusées (téléphone ou
 * réglage de l'application) : tout apparaît directement à sa place finale.
 */

/** Durées en secondes (unité de motion) : rapide 150 ms, standard 250 ms, emphase 450 ms. */
export const DURATION = Object.freeze({ fast: 0.15, standard: 0.25, emphasis: 0.45 });

/** Courbes : standard (déplacement), entrée (décélère), sortie (accélère). */
export const EASE = Object.freeze({
  standard: [0.2, 0, 0, 1],
  enter: [0, 0, 0.2, 1],
  exit: [0.4, 0, 1, 1]
});

/** Léger rebond (panneaux, marqueurs, coche) : se pose en moins de 450 ms. */
export const SPRING = Object.freeze({ type: 'spring', stiffness: 520, damping: 26, mass: 0.8 });

/** Éléments animés à la fois au plus (au-delà : affichés directement). */
export const MAX_ANIMATED = 20;
/** Délai entre deux éléments d'une liste en cascade. */
export const STAGGER = 0.05;

/** Variantes réutilisables (états "hidden" -> "visible", et "exit"). */
export const variants = Object.freeze({
  /** Apparition : fondu et petite montée. custom = rang dans une cascade. */
  appear: {
    hidden: { opacity: 0, y: 12 },
    visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: DURATION.standard, ease: EASE.enter, delay: Math.min(i, MAX_ANIMATED) * STAGGER } }),
    exit: { opacity: 0, transition: { duration: DURATION.fast, ease: EASE.exit } }
  },
  /** Glissement horizontal. custom = sens (+1 vers la droite, -1 vers la gauche). */
  slide: {
    hidden: (dir = 1) => ({ opacity: 0, x: 32 * dir }),
    visible: { opacity: 1, x: 0, transition: { duration: DURATION.standard, ease: EASE.standard } },
    exit: (dir = 1) => ({ opacity: 0, x: -32 * dir, transition: { duration: DURATION.fast, ease: EASE.exit } })
  },
  /** Pop : apparition avec léger rebond. */
  pop: {
    hidden: { opacity: 0, scale: 0.4 },
    visible: { opacity: 1, scale: 1, transition: SPRING },
    exit: { opacity: 0, scale: 0.8, transition: { duration: DURATION.fast } }
  }
});

/**
 * Animations permises : ni le téléphone (prefers-reduced-motion, réglage
 * Android "Supprimer les animations") ni le réglage de l'application ne
 * demandent de les réduire. Mis à jour en direct.
 */
export function useMotionAllowed() {
  const phoneReduced = useReducedMotion();
  const appReduced = useSyncExternalStore(onReducedMotionChange, isAppReducedMotion, () => false);
  return !phoneReduced && !appReduced;
}

/** Clés déjà affichées pendant la session : leurs animations ne rejouent pas. */
const shown = new Set();

/**
 * Premier affichage de `key` pendant la session (liste du jour, favoris…) ?
 * Revenir sur un onglet déjà vu ne rejoue rien.
 * @param {string} key
 */
export function useFirstShow(key) {
  const [state, setState] = useState(() => ({ key, first: !shown.has(key) }));
  if (state.key !== key) setState({ key, first: !shown.has(key) });
  useEffect(() => {
    shown.add(key);
  }, [key]);
  return state.key === key ? state.first : !shown.has(key);
}

/**
 * Propriétés d'un élément de liste en cascade (m.li, m.div…) : animé au
 * premier affichage seulement, dans la limite de MAX_ANIMATED éléments.
 * @param {number} index
 * @param {boolean} animate premier affichage et animations permises
 */
export function cascadeProps(index, animate) {
  return {
    variants: variants.appear,
    custom: index,
    initial: animate && index < MAX_ANIMATED ? 'hidden' : false,
    animate: 'visible'
  };
}
