import { useState, useSyncExternalStore } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePublicLinks } from '../../config/links.js';
import { getInstallMode, onInstallModeChange, promptInstall } from '../../platform/install.js';
import IosInstallHelp from '../install/IosInstallHelp.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

/**
 * Version web : installation de l'application. Bouton du navigateur (Chrome,
 * Edge sur ordinateur), lien vers le Play Store sur Android, aide en trois
 * étapes sur iPhone. Rien dans l'application déjà installée, ni quand le
 * navigateur ne propose pas d'installation.
 */
export default function InstallSection() {
  const { t } = useTranslation();
  const mode = useSyncExternalStore(onInstallModeChange, getInstallMode);
  const [help, setHelp] = useState(false);
  const { playStore } = usePublicLinks();
  if (mode === 'installed' || mode === 'none') return null;

  return (
    <Card as="section" className="space-y-2">
      <h2 className="text-xl">{t('install.title')}</h2>
      <p className="text-ink-muted">{t(mode === 'playStore' ? 'install.playStoreHint' : 'install.hint')}</p>
      {mode === 'playStore' ? (
        <a
          href={playStore}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary-strong px-5 font-semibold text-white shadow-sm hover:bg-primary-hover"
        >
          <Download aria-hidden="true" className="size-6 shrink-0" />
          {t('install.playStore')}
        </a>
      ) : (
        <Button icon={Download} onClick={() => (mode === 'ios' ? setHelp(true) : promptInstall())}>
          {t('install.button')}
        </Button>
      )}
      {help && <IosInstallHelp onClose={() => setHelp(false)} />}
    </Card>
  );
}
