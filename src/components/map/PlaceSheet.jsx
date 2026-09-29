import { CalendarDays, Globe, Navigation } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { illustrationForStep } from '../../illustrations/index.jsx';
import { usePlaceName } from '../../i18n/usePlaceName.js';
import { geoUrl, webUrl } from '../../utils/navigation.js';
import Badge from '../ui/Badge.jsx';
import BottomSheet from '../ui/BottomSheet.jsx';
import Photo from '../ui/Photo.jsx';

const LINK = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-secondary-strong px-4 font-semibold text-secondary-strong hover:bg-secondary-soft';

/**
 * Fiche d'un lieu de la carte, en panneau : photo (ou illustration de sa
 * catégorie) et crédit écrit en clair, horaire et ordre de visite, label,
 * itinéraire, site, et accès à l'étape dans le planning.
 * @param {{ step: object, order: number, date: string, onClose: () => void }} props
 */
export default function PlaceSheet({ step, order, date, onClose }) {
  const { t } = useTranslation();
  const { placeName } = usePlaceName();
  const navigate = useNavigate();
  const place = step.place;
  const name = placeName(place);

  return (
    <BottomSheet title={name} onClose={onClose}>
      <Photo image={place.image} illustration={illustrationForStep(step)} alt={t('image.alt', { name })} credit="inline" className="aspect-[16/9] w-full rounded-2xl" />
      <p className="text-lg">
        {t('map.sheetWhen', { order, start: step.start, end: step.end })} · {t(`categories.${place.category}`)}
      </p>
      {place.certified && place.certification && (
        <Badge tone="accent" className="self-start">
          {t(`certifications.${place.certification}`)}
        </Badge>
      )}
      {place.description && <p className="text-ink-muted">{place.description}</p>}
      <div className="flex flex-wrap gap-2">
        <a href={geoUrl(place, name)} className={LINK}>
          <Navigation aria-hidden="true" className="size-5" />
          {t('planning.directions')}
        </a>
        {place.url && !place.food && (
          <a href={webUrl(place.url)} target="_blank" rel="noreferrer" className={LINK}>
            <Globe aria-hidden="true" className="size-5" />
            {t('planning.website')}
          </a>
        )}
        <button type="button" onClick={() => navigate(`/planning?day=${date}&step=${step.id}`)} className={LINK}>
          <CalendarDays aria-hidden="true" className="size-5" />
          {t('map.openInPlanning')}
        </button>
      </div>
    </BottomSheet>
  );
}
