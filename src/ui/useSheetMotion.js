import { useCallback, useMemo, useState } from 'react';
import { DURATION, EASE, SPRING, useMotionAllowed } from './motion.js';

/**
 * Animation des panneaux (BottomSheet, Dialog) : ouverture depuis le bas avec
 * un léger rebond, fermeture par glissement vers le bas, fond en fondu.
 * requestClose remplace onClose (bouton Fermer, Échap, appui sur le fond) :
 * le panneau glisse puis onClose est appelé. Animations refusées : ouverture
 * et fermeture immédiates.
 * @param {() => void} onClose
 * @param {{ fullScreen?: boolean }} [options] plein écran : fondu et petite montée, sans rebond
 */
export function useSheetMotion(onClose, { fullScreen = false } = {}) {
  const allowed = useMotionAllowed();
  const [closing, setClosing] = useState(false);
  const requestClose = useCallback(() => (allowed ? setClosing(true) : onClose()), [allowed, onClose]);

  const hidden = fullScreen ? { opacity: 0, y: 24 } : { y: '100%' };
  // Cible de la fermeture, stable : onAnimationComplete se déclenche aussi quand l'ouverture est
  // interrompue ; on ne ferme qu'à la fin de CETTE animation.
  const closeTarget = useMemo(
    () => ({ ...(fullScreen ? { opacity: 0, y: 24 } : { y: '100%' }), transition: { duration: DURATION.standard, ease: EASE.exit } }),
    [fullScreen]
  );
  const backdrop = {
    initial: allowed ? { opacity: 0 } : false,
    animate: { opacity: closing ? 0 : 1 },
    transition: { duration: DURATION.fast }
  };
  const panel = {
    initial: allowed ? hidden : false,
    animate: closing ? closeTarget : { opacity: 1, y: 0, transition: fullScreen ? { duration: DURATION.standard, ease: EASE.enter } : SPRING },
    onAnimationComplete: (definition) => definition === closeTarget && onClose()
  };
  return { requestClose, backdrop, panel };
}
