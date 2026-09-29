import { useId, useRef } from 'react';
import { X } from 'lucide-react';
import { m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useModalFocus } from '../../hooks/useModalFocus.js';
import { useSheetMotion } from '../../ui/useSheetMotion.js';
import Button from './Button.jsx';

/**
 * Panneau modal accessible (role="dialog", aria-modal) : voir useModalFocus.
 * En bas de l'écran sur téléphone, centré sur grand écran.
 * fullScreen : panneau plein écran (formulaires longs).
 * @param {{ title: string, onClose: () => void, children: import('react').ReactNode, footer?: import('react').ReactNode, fullScreen?: boolean }} props
 */
export default function Dialog({ title, onClose, children, footer, fullScreen = false }) {
  const { t } = useTranslation();
  const ref = useRef(null);
  const titleId = useId();
  const { requestClose, backdrop, panel } = useSheetMotion(onClose, { fullScreen });
  useModalFocus(ref, requestClose);

  return (
    <m.div
      {...backdrop}
      className={`fixed inset-0 z-[1200] flex justify-center bg-ink/50 ${fullScreen ? 'items-stretch' : 'items-end sm:items-center'}`}
      onMouseDown={(e) => !fullScreen && e.target === e.currentTarget && requestClose()}
    >
      <m.div
        {...panel}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={
          fullScreen
            ? 'h-dvh w-full max-w-2xl overflow-y-auto bg-surface p-4 pt-safe pb-safe'
            : 'max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-surface p-4 pb-safe shadow-xl sm:rounded-3xl'
        }
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 id={titleId} tabIndex={-1} className="text-2xl">
            {title}
          </h2>
          <Button variant="ghost" icon={X} onClick={requestClose} aria-label={t('common.close')} />
        </div>
        <div className="space-y-4">{children}</div>
        {footer && <div className="mt-4 grid gap-2 sm:grid-cols-2">{footer}</div>}
      </m.div>
    </m.div>
  );
}
