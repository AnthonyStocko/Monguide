import { Globe, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openingHoursOfDay } from '@domain/openingHours.js';
import { telUrl, webUrl } from '../../utils/navigation.js';
import Badge from '../ui/Badge.jsx';

/**
 * Détails d'un restaurant (données OpenStreetMap) : cuisine, badges, horaires
 * du jour en clair, boutons Appeler et Site web s'ils existent.
 * @param {{ place: object, date: string, countryCode: string, badges: string[] }} props
 */
export default function RestaurantDetails({ place, date, countryCode, badges }) {
  const { t, i18n } = useTranslation();
  const food = place.food;
  const hours = openingHoursOfDay(food.openingHours, { date, lat: place.lat, lon: place.lon, countryCode });
  const dayName = new Intl.DateTimeFormat(i18n.resolvedLanguage, { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));

  return (
    <div className="space-y-2">
      {food.cuisine?.length > 0 && <p>{t('restaurant.cuisine', { list: food.cuisine.map((c) => c.replace(/_/g, ' ')).join(', ') })}</p>}
      <div className="flex flex-wrap gap-2">
        {food.regional && <Badge tone="primary">{t('food.regional')}</Badge>}
        {food.vegetarian && <Badge tone="primary">{t('restaurant.vegetarian')}</Badge>}
        {(food.wheelchair === 'yes' || food.wheelchair === 'limited') && (
          <Badge tone="secondary">{t(food.wheelchair === 'yes' ? 'restaurant.wheelchair' : 'restaurant.wheelchairLimited')}</Badge>
        )}
        {badges.includes('hours_unconfirmed') && <Badge tone="warning">{t('badges.hours_unconfirmed')}</Badge>}
        {badges.includes('info_missing') && <Badge tone="warning">{t('badges.info_missing')}</Badge>}
      </div>
      <p>
        {hours === null
          ? t('restaurant.hoursUnknown')
          : hours === ''
            ? t('restaurant.closedThatDay', { day: dayName })
            : t('restaurant.hoursOfDay', { day: dayName, hours })}
      </p>
      {(food.phone || food.website) && (
        <div className="flex flex-wrap gap-2">
          {food.phone && (
            <a href={telUrl(food.phone)} className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-secondary-strong px-4 font-semibold text-secondary-strong">
              <Phone aria-hidden="true" className="size-5" />
              {t('restaurant.call')}
            </a>
          )}
          {food.website && (
            <a href={webUrl(food.website)} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-secondary-strong px-4 font-semibold text-secondary-strong">
              <Globe aria-hidden="true" className="size-5" />
              {t('restaurant.website')}
            </a>
          )}
        </div>
      )}
      <p className="text-ink-muted">{t('restaurant.osmNotice')}</p>
    </div>
  );
}
