import { RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Illustration from '../../illustrations/index.jsx';
import Button from './Button.jsx';

/**
 * Erreur avec illustration (erreur, ou hors ligne) et bouton "Réessayer".
 * @param {{ title?: string, message?: string, onRetry?: () => void, illustration?: 'error' | 'offline' }} props
 */
export default function ErrorState({ title, message, onRetry, illustration = 'error' }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <Illustration name={illustration} className="aspect-[4/3] w-full max-w-48 rounded-3xl" />
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
