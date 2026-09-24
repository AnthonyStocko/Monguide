import { RotateCcw, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from './Button.jsx';

/**
 * Erreur avec bouton "Réessayer".
 * @param {{ title?: string, message?: string, onRetry?: () => void }} props
 */
export default function ErrorState({ title, message, onRetry }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-danger-soft">
        <TriangleAlert aria-hidden="true" className="size-8 text-danger-on-soft" />
      </div>
      <h2 className="text-xl font-semibold">{title ?? t('error.title')}</h2>
      {message && <p className="max-w-md text-ink-muted">{message}</p>}
      {onRetry && (
        <Button variant="secondary" icon={RotateCcw} onClick={onRetry} className="mt-2">
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
