import { useEffect, useState } from 'react';
import { m } from 'motion/react';
import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { addDays } from '@domain/dates.js';
import { useFormat } from '../../i18n/useFormat.js';
import { getWeather } from '../../services/dataApi.js';
import { useFirstShow, useMotionAllowed, variants } from '../../ui/motion.js';
import { middayWeather } from '../../utils/tripStatus.js';
import { usePhoto } from '../ui/Photo.jsx';

/**
 * Grande carte du prochain séjour (accueil) : photo de la destination (ou
 * paysage illustré), compte à rebours et météo du premier jour (du jour même
 * si le séjour est en cours) en pastilles, titre et dates sur un voile sombre.
 * Toute la carte ouvre le planning ; le crédit reste accessible ("i").
 * @param {{ trip: object, status: { status: 'current' | 'upcoming', daysUntil?: number, dayNumber?: number, dayCount: number } }} props
 */
export default function NextTripCard({ trip, status }) {
  const { t } = useTranslation();
  const format = useFormat();
  const allowed = useMotionAllowed();
  const firstShow = useFirstShow('home:next');
  const [weather, setWeather] = useState(null);
  const day = status.status === 'current' ? addDays(trip.startDate, status.dayNumber - 1) : trip.startDate;

  useEffect(() => {
    let alive = true;
    getWeather({ lat: trip.destination.lat, lon: trip.destination.lon, timezone: trip.timezone, startDate: day, endDate: day })
      .then((res) => alive && setWeather(middayWeather(res.data.days?.find((d) => d.date === day))))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [trip.destination.lat, trip.destination.lon, trip.timezone, day]);

  const countdown =
    status.status === 'current'
      ? t('home.countdown.current', { day: status.dayNumber, total: status.dayCount })
      : t('home.countdown.upcoming', { count: status.daysUntil });
  const date = (d) => format.date(`${d}T12:00:00Z`, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

  const { media, creditBlock } = usePhoto({
    image: trip.hero,
    alt: t('image.alt', { name: trip.title }),
    illustration: 'landscape',
    className: 'aspect-[4/3] w-full',
    overlay: (
      <>
        <div className="absolute top-3 left-3 flex max-w-[calc(100%-4rem)] flex-wrap gap-2">
          <span className="rounded-full bg-surface px-3 py-1 font-semibold text-primary-on-soft shadow-sm">{countdown}</span>
          {weather && (
            <span className="rounded-full bg-ink/75 px-3 py-1 font-semibold text-white">
              {weather.kind ? t('home.weather', { temperature: weather.temperature, label: t(`weatherKinds.${weather.kind}`) }) : `${weather.temperature}°`}
            </span>
          )}
        </div>
        <div className="image-scrim absolute inset-x-0 bottom-0 px-4 pb-4">
          <h2 className="text-3xl leading-tight text-white">
            <Link to={`/planning/${trip.id}`} className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:rounded-3xl focus-visible:after:outline-3 focus-visible:after:outline-focus">
              {trip.title}
            </Link>
          </h2>
          <p className="text-white">
            {date(trip.startDate)} → {date(trip.endDate)} · {t('home.travelers', { count: trip.travelers })}
          </p>
        </div>
      </>
    )
  });

  return (
    <m.article
      variants={variants.appear}
      initial={allowed && firstShow ? 'hidden' : false}
      animate="visible"
      className="relative overflow-hidden rounded-3xl bg-surface shadow-md"
    >
      {media}
      {creditBlock && <div className="px-4">{creditBlock}</div>}
    </m.article>
  );
}
