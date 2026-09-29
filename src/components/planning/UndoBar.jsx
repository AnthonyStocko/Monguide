import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Toast from '../ui/Toast.jsx';

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

  return <Toast message={message} action={{ label: t('replan.undo'), onClick: onUndo, ariaLabel: t('replan.undoLabel', { seconds: left }) }} />;
}
