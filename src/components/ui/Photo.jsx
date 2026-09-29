import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { isPlaceImage } from '@domain/model.js';
import { isAllowedImageUrl } from '../../config/images.js';
import { useImageSrc } from '../../hooks/useImageSrc.js';
import Illustration from '../../illustrations/index.jsx';
import ImageCredit from './ImageCredit.jsx';

/** Photos déjà affichées pendant la session : pas de nouveau fondu en revenant sur un écran. */
const loadedUrls = new Set();

/**
 * Photo d'un lieu ou, à défaut (absente, sans crédit, domaine non autorisé,
 * échec de chargement, hors ligne sans copie), illustration maison : jamais
 * d'image cassée ni de cadre vide, jamais de photo sans son crédit.
 * L'illustration reste dessous pendant le chargement ; la photo apparaît en
 * fondu. Copie hors ligne utilisée si elle existe (useImageSrc).
 *
 * alt : description de la photo (nom du lieu ou de la destination, lu par
 * TalkBack) ; l'illustration de repli reste décorative (aria-hidden).
 * Crédit : "button" (défaut) = bouton "i" discret sur la photo (zone de
 * 48 px) qui affiche le crédit et ses liens ; "inline" = crédit écrit en
 * clair (fiches de lieu).
 *
 * @param {{ image?: object | null, illustration?: import('../../illustrations/index.jsx').IllustrationName, alt?: string, className?: string, overlay?: import('react').ReactNode, credit?: 'button' | 'inline' }} options
 * @returns {{ media: import('react').ReactNode, creditBlock: import('react').ReactNode }}
 */
export function usePhoto({ image, illustration = 'landscape', alt = '', className = '', overlay = null, credit = 'button' }) {
  const { t } = useTranslation();
  const panelId = useId();
  const [open, setOpen] = useState(false);
  // État rattaché à l'adresse : une nouvelle photo repart de zéro.
  const [load, setLoad] = useState({ url: null, status: 'loading' });
  const valid = Boolean(image) && (isPlaceImage(image) || (isAllowedImageUrl(image.thumbUrl) && image.credit?.license));
  const url = valid ? image.thumbUrl : null;
  const src = useImageSrc(url);
  const status = load.url === url ? load.status : loadedUrls.has(url) ? 'loaded' : 'loading';
  const fade = !loadedUrls.has(url) || load.url === url;
  const usable = valid && status !== 'error';

  const media = (
    <div className={`relative overflow-hidden bg-subtle ${className}`}>
      <Illustration name={illustration} className="absolute inset-0 size-full" />
      {usable && src && (
        <img
          src={src}
          width={image.width}
          height={image.height}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => {
            if (!loadedUrls.has(url)) setLoad({ url, status: 'loaded' });
            loadedUrls.add(url);
          }}
          onError={() => setLoad({ url, status: 'error' })}
          className={`absolute inset-0 size-full object-cover ${fade ? 'motion-ok:transition-opacity motion-ok:duration-300' : ''} ${status === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {overlay}
      {usable && credit === 'button' && (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={t(open ? 'image.hideCredit' : 'image.showCredit')}
          onClick={() => setOpen((o) => !o)}
          className="absolute top-0 right-0 z-10 inline-flex size-12 items-center justify-center"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-ink/75 text-white shadow-sm">
            <Info aria-hidden="true" className="size-5" />
          </span>
        </button>
      )}
    </div>
  );

  let creditBlock = null;
  if (usable && credit === 'inline') creditBlock = <ImageCredit credit={image.credit} />;
  if (usable && credit === 'button') {
    creditBlock = (
      <div id={panelId} hidden={!open}>
        <ImageCredit credit={image.credit} />
      </div>
    );
  }
  return { media, creditBlock };
}

/**
 * Photo (ou illustration) et son crédit, l'un sous l'autre.
 * @param {Parameters<typeof usePhoto>[0] & { creditClassName?: string }} props
 */
export default function Photo({ creditClassName = '', ...options }) {
  const { media, creditBlock } = usePhoto(options);
  return (
    <div>
      {media}
      {creditBlock && <div className={creditClassName}>{creditBlock}</div>}
    </div>
  );
}
