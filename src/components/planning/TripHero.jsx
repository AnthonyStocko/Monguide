import { useTranslation } from 'react-i18next';
import { usePhoto } from '../ui/Photo.jsx';

/**
 * En-tête du planning : photo de la destination (trip.hero) ou, à défaut,
 * paysage illustré ; jour affiché (« Jour 1 sur 3 · vendredi 25 septembre »)
 * et titre posés sur un voile sombre (contraste garanti, photo claire ou
 * sombre) ; crédit derrière le bouton "i".
 * @param {{ trip: object, kicker: string, children?: import('react').ReactNode }} props
 */
export default function TripHero({ trip, kicker, children }) {
  const { t } = useTranslation();
  const { media, creditBlock } = usePhoto({
    image: trip.hero,
    alt: t('image.alt', { name: trip.title }),
    illustration: 'landscape',
    className: 'aspect-[16/9] max-h-64 w-full',
    overlay: (
      <div className="image-scrim absolute inset-x-0 bottom-0 px-4 pb-3 text-white">
        <p className="font-semibold text-white first-letter:uppercase">{kicker}</p>
        <h2 className="text-3xl leading-tight text-white">{trip.title}</h2>
      </div>
    )
  });
  return (
    <header className="overflow-hidden rounded-3xl border border-line bg-surface shadow-sm">
      {media}
      {creditBlock && <div className="px-4">{creditBlock}</div>}
      {children && <div className="p-3">{children}</div>}
    </header>
  );
}
