import { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button.jsx';

/**
 * Message affiché après un réajustement appliqué, avec un bouton "Annuler"
 * pendant rules.ui.undoDelaySec secondes.
 * @param {{ message: string, seconds: number, onUndo: () => void, onExpire: () => void }} props
 */
export default function UndoBar({ message, seconds, onUndo, onExpire }) {
  const { t } = useTranslation();
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (left <= 0) {
      onExpire();
      return undefined;
    }
    const timer = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [left, onExpire]);

  return (
    <div role="status" className="fixed inset-x-0 bottom-20 z-[1100] mx-auto flex max-w-lg items-center gap-3 rounded-2xl bg-ink px-4 py-2 text-white shadow-xl sm:bottom-6">
      <p className="flex-1">{message}</p>
      <Button variant="secondary" icon={Undo2} onClick={onUndo} aria-label={t('replan.undoLabel', { seconds: left })}>
        {t('replan.undo')}
      </Button>
    </div>
  );
}
