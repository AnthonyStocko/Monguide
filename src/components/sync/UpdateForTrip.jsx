import { RefreshCw, Smartphone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePublicLinks } from '../../config/links.js';
import { isNative } from '../../platform/target.js';
import Button from '../ui/Button.jsx';

/**
 * Mise à jour nécessaire pour ce séjour : lien Google Play (Android) ou
 * rechargement de la page (version web, mise à jour au rechargement).
 * @param {{ text: string }} props
 */
export default function UpdateForTrip({ text }) {
  const { t } = useTranslation();
  const links = usePublicLinks();
  return (
    <div className="space-y-3 rounded-xl bg-warning-soft px-3 py-3 text-warning-on-soft">
      <p className="font-medium">{text}</p>
      {isNative ? (
        <a href={links.playStore} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-12 items-center gap-2 font-semibold underline underline-offset-2">
          <Smartphone aria-hidden="true" className="size-5" />
          {t('tripUpdate.playStore')}
        </a>
      ) : (
        <Button variant="secondary" icon={RefreshCw} onClick={() => window.location.reload()}>
          {t('tripUpdate.reload')}
        </Button>
      )}
    </div>
  );
}
