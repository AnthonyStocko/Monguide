import { useEffect, useState } from 'react';
import { CalendarDays, Heart, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import Page from '../components/layout/Page.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useFormat } from '../i18n/useFormat.js';
import { deleteTrip, listTrips, setCurrentTripId } from '../services/tripsStore.js';

/** Séjours enregistrés sur l'appareil (historique), consultables hors ligne. */
export default function FavoritesPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();
  const [trips, setTrips] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = () => listTrips().then(setTrips).catch(() => setTrips([]));
  useEffect(() => {
    load();
  }, []);

  const open = async (trip) => {
    await setCurrentTripId(trip.id);
    navigate(`/planning/${trip.id}`);
  };
  const remove = async () => {
    await deleteTrip(confirm.id);
    setConfirm(null);
    load();
  };
  const date = (d) => format.date(`${d}T12:00:00Z`, { dateStyle: 'medium', timeZone: 'UTC' });

  return (
    <Page>
      <h2 className="text-2xl font-bold">{t('trips.title')}</h2>
      {trips === null && <Skeleton className="h-24 w-full" />}
      {trips?.length === 0 && (
        <Card>
          <EmptyState icon={Heart} title={t('trips.emptyTitle')} description={t('trips.emptyText')} />
        </Card>
      )}
      <ul className="space-y-3">
        {trips?.map((trip) => (
          <li key={trip.id}>
            <Card className="space-y-2">
              <h3 className="text-xl font-semibold">{trip.title}</h3>
              <p>
                {date(trip.startDate)} – {date(trip.endDate)}
              </p>
              <p className="text-ink-muted">{t('trips.created', { date: format.date(trip.createdAt, { dateStyle: 'medium' }) })}</p>
              <div className="grid grid-cols-2 gap-2">
                <Button icon={CalendarDays} onClick={() => open(trip)}>
                  {t('trips.open')}
                </Button>
                <Button variant="secondary" icon={Trash2} onClick={() => setConfirm(trip)} aria-label={t('trips.deleteNamed', { name: trip.title })}>
                  {t('trips.delete')}
                </Button>
              </div>
            </Card>
          </li>
        ))}
      </ul>
      {confirm && (
        <Dialog
          title={t('trips.confirmTitle')}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                {t('common.cancel')}
              </Button>
              <Button icon={Trash2} onClick={remove}>
                {t('trips.confirm')}
              </Button>
            </>
          }
        >
          <p>{t('trips.confirmText', { name: confirm.title })}</p>
        </Dialog>
      )}
    </Page>
  );
}
