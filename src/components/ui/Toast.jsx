import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const ICON_TONES = { info: 'text-secondary-soft', success: 'text-primary-soft', warning: 'text-warning-soft' };

/**
 * Message bref en bas de l'écran, au-dessus de la barre d'onglets, annoncé
 * poliment (role="status"). Action facultative et bouton de fermeture, tous
 * deux de 48 px. La durée d'affichage est gérée par l'appelant.
 * @param {{ message: string, tone?: keyof typeof ICON_TONES, icon?: import('react').ComponentType<any>, action?: { label: string, onClick: () => void, ariaLabel?: string }, onClose?: () => void, inline?: boolean }} props
 */
export default function Toast({ message, tone = 'info', icon: Icon, action, onClose, inline = false }) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className={`${inline ? '' : 'fixed inset-x-4 bottom-[calc(var(--nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-[1100] sm:bottom-6'} mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-ink py-1 pr-1 pl-4 text-white shadow-xl motion-ok:animate-rise-in`}
    >
      {Icon && <Icon aria-hidden="true" className={`size-6 shrink-0 ${ICON_TONES[tone]}`} />}
      <p className="flex-1 py-2">{message}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          aria-label={action.ariaLabel}
          className="min-h-12 rounded-xl px-3 font-semibold text-primary-soft underline underline-offset-4 hover:bg-white/10"
        >
          {action.label}
        </button>
      )}
      {onClose && (
        <button type="button" onClick={onClose} aria-label={t('common.close')} className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl hover:bg-white/10">
          <X aria-hidden="true" className="size-6" />
        </button>
      )}
    </div>
  );
}
