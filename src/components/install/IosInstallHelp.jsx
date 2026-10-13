import { Check, Share, SquarePlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';

const STEPS = [
  { icon: Share, title: 'install.ios.step1', hint: 'install.ios.step1Hint' },
  { icon: SquarePlus, title: 'install.ios.step2', hint: 'install.ios.step2Hint' },
  { icon: Check, title: 'install.ios.step3', hint: 'install.ios.step3Hint' }
];

/**
 * iPhone (Safari) : aide illustrée pour ajouter Mon guide à l'écran
 * d'accueil, en trois étapes. Fermer = « Plus tard ».
 * @param {{ onClose: () => void, onNever?: () => void, showStorage?: boolean }} props
 *   onNever : refus définitif (proposition automatique seulement) ;
 *   showStorage : rappelle pourquoi installer protège les séjours (mode invité).
 */
export default function IosInstallHelp({ onClose, onNever, showStorage = false }) {
  const { t } = useTranslation();
  return (
    <Dialog
      title={t('install.ios.title')}
      onClose={onClose}
      footer={
        onNever && (
          <>
            <Button variant="ghost" onClick={onNever}>
              {t('install.never')}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t('install.later')}
            </Button>
          </>
        )
      }
    >
      <p>{showStorage ? t('install.storage') : t('install.ios.intro')}</p>
      <ol className="space-y-3">
        {STEPS.map(({ icon: Icon, title, hint }, index) => (
          <li key={title} className="flex items-center gap-3">
            <span className="relative flex size-16 shrink-0 items-center justify-center rounded-2xl bg-secondary-soft">
              <Icon aria-hidden="true" className="size-8 text-secondary-strong" />
              <span aria-hidden="true" className="absolute -top-2 -left-2 flex size-7 items-center justify-center rounded-full bg-ink font-bold text-white">
                {index + 1}
              </span>
            </span>
            <span>
              <span className="block font-semibold">{t(title)}</span>
              <span className="block text-ink-muted">{t(hint)}</span>
            </span>
          </li>
        ))}
      </ol>
    </Dialog>
  );
}
