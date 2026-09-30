import { CalendarCheck } from 'lucide-react';
import { m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { illustrationForCategory } from '../../../illustrations/index.jsx';
import { useFormat } from '../../../i18n/useFormat.js';
import { usePlaceName } from '../../../i18n/usePlaceName.js';
import { cascadeProps } from '../../../ui/motion.js';
import Badge from '../../ui/Badge.jsx';
import { usePhoto } from '../../ui/Photo.jsx';
import TravelTime from '../TravelTime.jsx';

const OPENING_TONES = { open: 'primary', closed: 'danger', unknown: 'warning' };

/**
 * Carte d'un lieu de la liste « + Ajouter une étape » : vignette (photo ou
 * illustration), nom, trajet estimé « ≈ », ouvert ou fermé à l'heure
 * choisie, badges, « Déjà prévu ». Toute la carte est un bouton qui ouvre la
 * fiche du lieu.
 * @param {{ item: import('@domain/listCandidates.js').CandidateItem, time: string, mode: string, dayName: (date: string) => string,
 *   onOpen: () => void, cascade: { index: number, animate: boolean } }} props
 */
export default function CandidateCard({ item, time, mode, dayName, onOpen, cascade }) {
  const { t } = useTranslation();
  const { placeName } = usePlaceName();
  const format = useFormat();
  const { place, opening, planned } = item;
  // « Horaires non confirmés » : déjà dit par l'état d'ouverture.
  const badges = item.badges.filter((b) => b !== 'hours_unconfirmed');
  const name = placeName(place);
  // Vignette décorative : le nom est lu dans le bouton.
  const { media } = usePhoto({ image: place.image, illustration: illustrationForCategory(place.category), alt: '', className: 'size-20 shrink-0 rounded-xl', credit: 'none' });

  return (
    <m.li {...cascadeProps(cascade.index, cascade.animate)}>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-start gap-3 rounded-3xl border-2 border-transparent bg-surface p-3 text-left shadow-sm hover:border-line-strong focus-visible:border-primary-strong"
      >
        {media}
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block text-lg leading-snug font-semibold">{name}</span>
          <span className="block text-ink-muted">
            {t(`categories.${place.category}`)} · <TravelTime minutes={item.travelMin} mode={mode} />
            <span className="whitespace-nowrap"> · {t('addStep.distance', { km: format.number(item.distanceKm, { maximumFractionDigits: 1 }) })}</span>
          </span>
          <span className="flex flex-wrap gap-2">
            {opening && <Badge tone={OPENING_TONES[opening]}>{opening === 'unknown' ? t('addStep.hoursUnknown') : t(`addStep.${opening}`, { time })}</Badge>}
            {badges.map((b) => (
              <Badge key={b} tone={b === 'info_missing' ? 'warning' : 'accent'}>
                {b === 'info_missing' ? t(`badges.${b}`) : t(`certifications.${b}`)}
              </Badge>
            ))}
            {planned && (
              <Badge tone="secondary" icon={CalendarCheck}>
                {t('addStep.planned', { day: dayName(planned.date) })}
              </Badge>
            )}
          </span>
        </span>
      </button>
    </m.li>
  );
}
