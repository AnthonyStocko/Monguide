import { useEffect, useState } from 'react';
import { CirclePlus } from 'lucide-react';
import { m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import Page from '../components/layout/Page.jsx';
import NextTripCard from '../components/trip/NextTripCard.jsx';
import TripImageCard from '../components/trip/TripImageCard.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useFormat } from '../i18n/useFormat.js';
import { listTrips, onTripsChanged } from '../services/tripsStore.js';
import { cascadeProps, useFirstShow, useMotionAllowed } from '../ui/motion.js';
import { nextTrip } from '../utils/tripStatus.js';

/** Séjours récents affichés sur l'accueil (les autres : onglet Favoris). */
const RECENT = 4;

/**
 * Accueil : salutation, carte du prochain séjour (en cours ou à venir), bouton
 * "Créer un nouveau séjour", séjours récents en cartes à image. Sans séjour :
 * état vide illustré avec l'action de création.
 */
export default function HomePage() {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();
  const allowed = useMotionAllowed();
  const firstShow = useFirstShow('home:recent');
  const [trips, setTrips] = useState(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      listTrips()
        .then((list) => alive && setTrips(list))
        .catch(() => alive && setTrips([]));
    load();
    const stop = onTripsChanged(load);
    return () => {
      alive = false;
      stop();
    };
  }, []);

  const next = trips ? nextTrip(trips) : null;
  const recent = trips ? trips.filter((trip) => trip.id !== next?.trip.id).slice(0, RECENT) : [];
  const subtitle = !next
    ? t('home.today', { date: format.date(new Date(), { dateStyle: 'full' }) })
    : next.status === 'current'
      ? t('home.enjoy', { destination: next.trip.title })
      : t('home.untilDeparture', { count: next.daysUntil });

  const create = (
    <Button icon={CirclePlus} onClick={() => navigate('/create')} className="min-h-14 w-full text-lg shadow-md">
      {t('home.createNew')}
    </Button>
  );

  return (
    <Page className="space-y-5">
      <section className="space-y-1">
        <h2 className="text-3xl leading-tight">{t('home.greeting')}</h2>
        <p className="text-ink-muted">{subtitle}</p>
      </section>

      {trips === null && <Skeleton className="aspect-[4/3] w-full rounded-3xl" />}

      {trips?.length === 0 && (
        <Card>
          <EmptyState
            illustration="noTrips"
            title={t('home.emptyTitle')}
            description={t('home.emptyText')}
            action={
              <Button icon={CirclePlus} onClick={() => navigate('/create')}>
                {t('home.createCta')}
              </Button>
            }
          />
        </Card>
      )}

      {next && <NextTripCard trip={next.trip} status={next} />}
      {trips?.length > 0 && create}

      {recent.length > 0 && (
        <section aria-labelledby="home-recent" className="space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="home-recent" className="text-xl">
              {t('home.recentTitle')}
            </h2>
            <Link to="/favorites" className="inline-flex min-h-12 items-center font-semibold text-primary-strong underline-offset-4 hover:underline">
              {t('home.seeAll')}
            </Link>
          </div>
          <ul className="grid grid-cols-2 gap-3">
            {recent.map((trip, i) => (
              <m.li key={trip.id} {...cascadeProps(i, allowed && firstShow)} className="flex">
                <TripImageCard trip={trip} compact headingLevel={3} />
              </m.li>
            ))}
          </ul>
        </section>
      )}
    </Page>
  );
}
