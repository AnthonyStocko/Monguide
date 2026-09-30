import { useEffect } from 'react';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Panneaux ouverts, du plus ancien au plus récent : seul le dernier réagit au clavier. */
const stack = [];

/**
 * Comportement d'un panneau modal : focus placé sur son titre (h2) à
 * l'ouverture et rendu à l'élément d'origine à la fermeture, Échap pour
 * fermer, Tab maintenu dans le panneau. Panneaux superposés (fiche ouverte
 * par-dessus un panneau plein écran) : seul le plus récent réagit.
 * @param {import('react').RefObject<HTMLElement>} ref
 * @param {() => void} onClose
 */
export function useModalFocus(ref, onClose) {
  useEffect(() => {
    const previous = document.activeElement;
    const token = {};
    stack.push(token);
    ref.current?.querySelector('h2')?.focus();
    const onKey = (e) => {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const focusables = [...ref.current.querySelectorAll(FOCUSABLE)].filter((el) => !el.disabled);
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      previous?.focus?.();
    };
  }, [ref, onClose]);
}
