import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from './Button.jsx';

/**
 * Panneau modal accessible (role="dialog", aria-modal) : focus placé dans le
 * panneau à l'ouverture et rendu à l'élément d'origine à la fermeture, Échap
 * pour fermer, Tab maintenu dans le panneau.
 * fullScreen : panneau plein écran (formulaires longs).
 * @param {{ title: string, onClose: () => void, children: import('react').ReactNode, footer?: import('react').ReactNode, fullScreen?: boolean }} props
 */
export default function Dialog({ title, onClose, children, footer, fullScreen = false }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const titleId = useId();

  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.querySelector('h2')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !ref.current) return;
      const focusables = [...ref.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
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
      previous?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      className={`fixed inset-0 z-[1200] flex justify-center bg-ink/50 ${fullScreen ? 'items-stretch' : 'items-end sm:items-center'}`}
      onMouseDown={(e) => !fullScreen && e.target === e.currentTarget && onClose()}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={fullScreen ? 'h-dvh w-full max-w-2xl overflow-y-auto bg-surface p-4 pt-safe pb-safe' : 'max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-surface p-4 pb-safe shadow-xl sm:rounded-2xl'}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 id={titleId} tabIndex={-1} className="text-xl font-bold">
            {title}
          </h2>
          <Button variant="ghost" icon={X} onClick={onClose} aria-label={t('common.close')} />
        </div>
        <div className="space-y-4">{children}</div>
        {footer && <div className="mt-4 grid gap-2 sm:grid-cols-2">{footer}</div>}
      </div>
    </div>
  );
}
