import { useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Globe, MapPin, MessageSquareText, Star, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { hasReviewLinks, reviewLinks } from '@domain/reviewLinks.js';
import { useOnlineStatus } from '../../hooks/useOnlineStatus.js';
import { openExternalUrl } from '../../platform/externalUrl.js';
import BottomSheet from '../ui/BottomSheet.jsx';
import Button from '../ui/Button.jsx';

const BUTTON = 'inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-secondary-strong px-4 font-semibold text-secondary-strong hover:bg-secondary-soft';
const LINK = 'inline-flex min-h-12 min-w-12 items-center gap-1 rounded-lg px-2 font-semibold text-secondary-strong underline underline-offset-4 hover:bg-secondary-soft';

/**
 * « Voir les avis » d'un restaurant : bouton (variant "button") ou lien
 * discret « Avis » (variant "link", carte d'étape et listes). Un appui ouvre
 * une feuille d'actions : avis Google Maps, avis Tripadvisor, site du
 * restaurant s'il est connu. Chaque choix s'ouvre hors de l'application
 * (openExternalUrl) ; hors ligne, les choix sont désactivés. Rien n'est
 * affiché pour un lieu qui n'est pas un restaurant nommé (hasReviewLinks).
 * @param {{ place: object, city?: string, name: string, variant?: 'button' | 'link' }} props
 *   city : ville de la destination du séjour ; name : nom affiché du lieu
 */
export default function ReviewLinks({ place, city, name, variant = 'button' }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!hasReviewLinks(place)) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={variant === 'link' ? t('reviews.openNamed', { name }) : undefined}
        className={variant === 'link' ? LINK : BUTTON}
      >
        {variant === 'link' ? <Star aria-hidden="true" className="size-5" /> : <MessageSquareText aria-hidden="true" className="size-5" />}
        {variant === 'link' ? t('reviews.short') : t('reviews.open')}
      </button>
      {open && createPortal(<ReviewSheet place={place} city={city} name={name} onClose={close} />, document.body)}
    </>
  );
}

function ReviewSheet({ place, city, name, onClose }) {
  const { t, i18n } = useTranslation();
  const online = useOnlineStatus();
  const links = reviewLinks(place, i18n.resolvedLanguage, { city });
  const choices = [
    { key: 'google', icon: MapPin, url: links.google },
    { key: 'tripadvisor', icon: Star, url: links.tripadvisor },
    ...(links.website ? [{ key: 'website', icon: Globe, url: links.website }] : [])
  ];
  const choose = (url) => {
    openExternalUrl(url);
    onClose();
  };

  return (
    <BottomSheet
      title={t('reviews.title', { name })}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose} className="sm:col-span-2">
          {t('common.cancel')}
        </Button>
      }
    >
      {!online && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 font-medium text-warning-on-soft">
          <WifiOff aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
          {t('reviews.offline')}
        </p>
      )}
      <ul className="space-y-2">
        {choices.map(({ key, icon: Icon, url }) => (
          <li key={key}>
            <button
              type="button"
              disabled={!online}
              onClick={() => choose(url)}
              className="flex min-h-12 w-full items-center gap-3 rounded-xl border-2 border-line px-4 py-2 text-left text-lg font-semibold hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon aria-hidden="true" className="size-6 shrink-0 text-secondary-strong" />
              <span className="flex-1">
                {t(`reviews.${key}`)}
                <span className="sr-only">{t('reviews.external')}</span>
              </span>
              <ExternalLink aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
            </button>
          </li>
        ))}
      </ul>
      <p className="text-ink-muted">{t('reviews.notice')}</p>
    </BottomSheet>
  );
}
