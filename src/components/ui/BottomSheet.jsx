import { useId, useRef } from 'react';
import { X } from 'lucide-react';
import { m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useModalFocus } from '../../hooks/useModalFocus.js';
import { useSheetMotion } from '../../ui/useSheetMotion.js';
import Button from './Button.jsx';

/**
 * Feuille modale qui monte du bas de l'écran (choix rapides, détails d'un
 * lieu). Poignée décorative : on ferme avec le bouton, Échap ou un appui sur
 * le fond, jamais uniquement par un geste. Focus géré par useModalFocus.
 * @param {{ title: string, onClose: () => void, children: import('react').ReactNode, footer?: import('react').ReactNode }} props
 */
export default function BottomSheet({ title, onClose, children, footer }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const titleId = useId();
  const { requestClose, backdrop, panel } = useSheetMotion(onClose);
  useModalFocus(ref, requestClose);

  return (
    <m.div
      {...backdrop}
      className="fixed inset-0 z-[1200] flex items-end justify-center bg-ink/50"
      onMouseDown={(e) => e.target === e.currentTarget && requestClose()}
    >
      <m.div
        {...panel}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[85dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-surface px-4 pb-safe shadow-xl"
      >
        <div aria-hidden="true" className="mx-auto mt-2 h-1.5 w-12 rounded-full bg-line-strong" />
        <div className="flex items-start justify-between gap-2 pt-2">
          <h2 id={titleId} tabIndex={-1} className="pt-2 text-2xl">
            {title}
          </h2>
          <Button variant="ghost" icon={X} onClick={requestClose} aria-label={t('common.close')} />
        </div>
        <div className="space-y-4 pb-4">{children}</div>
        {footer && <div className="grid gap-2 pb-4 sm:grid-cols-2">{footer}</div>}
      </m.div>
    </m.div>
  );
}
