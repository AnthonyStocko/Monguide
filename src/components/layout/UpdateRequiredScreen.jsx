import { useState } from 'react';
import { CircleArrowUp, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfig } from '../../hooks/useConfig.js';
import Button from '../ui/Button.jsx';

/** Écran bloquant affiché quand le serveur exige une version plus récente. */
export default function UpdateRequiredScreen() {
  const { t } = useTranslation();
  const { refresh } = useConfig();
  const [checking, setChecking] = useState(false);

  const retry = async () => {
    setChecking(true);
    try {
      await refresh();
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-surface px-6 pt-safe pb-safe text-center">
      <div className="flex size-20 items-center justify-center rounded-full bg-primary-soft">
        <CircleArrowUp aria-hidden="true" className="size-10 text-primary" />
      </div>
      <h1 className="text-2xl font-bold">{t('update.title')}</h1>
      <p className="max-w-md text-ink-muted">{t('update.text')}</p>
      <Button variant="secondary" icon={RotateCcw} onClick={retry} disabled={checking}>
        {t('common.retry')}
      </Button>
    </main>
  );
}
