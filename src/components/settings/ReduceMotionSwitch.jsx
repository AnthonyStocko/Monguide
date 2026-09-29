import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getReducedMotion, setReducedMotion } from '../../services/motion.js';
import Switch from '../ui/Switch.jsx';

/** Interrupteur "Réduire les animations" (réglage enregistré, appliqué tout de suite). */
export default function ReduceMotionSwitch({ id = 'reduce-motion' }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(null);
  useEffect(() => {
    getReducedMotion().then(setValue);
  }, []);
  if (value === null) return null;
  return (
    <Switch
      id={id}
      label={t('motion.reduce')}
      checked={value}
      onChange={(next) => {
        setValue(next);
        setReducedMotion(next);
      }}
    />
  );
}
