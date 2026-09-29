import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useFormat } from '../../i18n/useFormat.js';
import { tripStatus } from '../../utils/tripStatus.js';
import Badge from '../ui/Badge.jsx';
import { usePhoto } from '../ui/Photo.jsx';

const STATUS_TONES = { current: 'primary', upcoming: 'secondary', past: 'neutral' };

/**
 * Carte à image d'un séjour (accueil, favoris) : photo de la destination ou
 * paysage illustré, titre (lien vers le planning, zone cliquable étendue à
 * toute la carte), durée et mois, statut en badge (facultatif), crédit
 * derrière le bouton "i" (au-dessus du lien).
 * @param {{ trip: object, showStatus?: boolean, headingLevel?: 3 | 4, compact?: boolean, children?: import('react').ReactNode }} props
 */
export default function TripImageCard({ trip, showStatus = false, headingLevel = 3, compact = false, children }) {
  const { t } = useTranslation();
  const format = useFormat();
  const Heading = `h${headingLevel}`;
  const info = tripStatus(trip);
  const { media, creditBlock } = usePhoto({ image: trip.hero, illustration: 'landscape', className: compact ? 'aspect-[16/9] w-full' : 'aspect-[2/1] w-full' });
  const month = format.date(`${trip.startDate}T12:00:00Z`, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  return (
    <article className="relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      {media}
      {creditBlock && <div className="px-3">{creditBlock}</div>}
      <div className={`flex flex-1 flex-col gap-1 ${compact ? 'p-3' : 'p-4'}`}>
        {showStatus && (
          <Badge tone={STATUS_TONES[info.status]} className="self-start">
            {t(`tripStatus.${info.status}`)}
          </Badge>
        )}
        <Heading className={compact ? 'text-lg leading-snug' : 'text-xl'}>
          <Link to={`/planning/${trip.id}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-2xl focus-visible:after:outline-3 focus-visible:after:outline-focus">
            {trip.title}
          </Link>
        </Heading>
        <p className="text-ink-muted first-letter:uppercase">{t('home.tripLength', { count: info.dayCount, month })}</p>
        {children && <div className="relative z-10 mt-2">{children}</div>}
      </div>
    </article>
  );
}
