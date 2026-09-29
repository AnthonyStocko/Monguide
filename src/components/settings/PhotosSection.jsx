import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { isWifiOnly, setWifiOnly } from '../../services/offlineImages.js';
import Card from '../ui/Card.jsx';
import Switch from '../ui/Switch.jsx';

/**
 * Réglage "Télécharger les images en Wi-Fi uniquement" (activé par défaut) :
 * photos des séjours enregistrées pour le hors ligne seulement en Wi-Fi.
 */
export default function PhotosSection() {
  const { t } = useTranslation();
  const [wifiOnly, setState] = useState(null);
  useEffect(() => {
    isWifiOnly().then(setState);
  }, []);

  const change = async (value) => {
    setState(value);
    await setWifiOnly(value);
  };

  return (
    <Card as="section" className="space-y-2">
      <h2 className="text-xl">{t('photos.title')}</h2>
      <p className="text-ink-muted">{t('photos.hint')}</p>
      {wifiOnly !== null && <Switch id="photos-wifi-only" label={t('photos.wifiOnlySetting')} checked={wifiOnly} onChange={change} />}
    </Card>
  );
}
