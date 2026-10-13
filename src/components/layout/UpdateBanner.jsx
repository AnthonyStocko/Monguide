import { useSyncExternalStore } from 'react';
import { CircleArrowUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { applyUpdate, isUpdateReady, onUpdateReady } from '../../platform/appUpdate.js';
import Button from '../ui/Button.jsx';

/**
 * Version web : bandeau affiché quand une nouvelle version est prête.
 * L'application n'est rechargée qu'à l'appui sur « Mettre à jour », jamais
 * d'elle-même (aucune saisie perdue).
 */
export default function UpdateBanner() {
  const { t } = useTranslation();
  const ready = useSyncExternalStore(onUpdateReady, isUpdateReady);

  return (
    <div role="status" aria-live="polite">
      {ready && (
        <div className="flex flex-wrap items-center justify-end gap-x-3 bg-primary-soft py-1 pr-2 pl-4 text-primary-on-soft">
          <p className="flex min-w-48 flex-1 items-center gap-2 py-2 font-medium">
            <CircleArrowUp aria-hidden="true" className="size-5 shrink-0" />
            {t('appUpdate.ready')}
          </p>
          <Button onClick={() => applyUpdate()}>{t('appUpdate.apply')}</Button>
        </div>
      )}
    </div>
  );
}
