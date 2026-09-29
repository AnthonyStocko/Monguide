import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getHapticsEnabled, setHapticsEnabled } from '../../services/haptics.js';
import Switch from '../ui/Switch.jsx';

/** Interrupteur "Vibrations" (validation d'étape, confirmation, erreur). */
export default function HapticsSwitch() {
  const { t } = useTranslation();
  const [value, setValue] = useState(null);
  useEffect(() => {
    getHapticsEnabled().then(setValue);
  }, []);
  if (value === null) return null;
  return (
    <Switch
      id="haptics"
      label={t('motion.haptics')}
      checked={value}
      onChange={(next) => {
        setValue(next);
        setHapticsEnabled(next);
      }}
    />
  );
}
