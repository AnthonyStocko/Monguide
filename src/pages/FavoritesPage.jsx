import { useEffect, useState } from 'react';
import { CirclePlus, CloudCheck, LogOut, Trash2, UserRound } from 'lucide-react';
import { m } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import Page from '../components/layout/Page.jsx';
import TripImageCard from '../components/trip/TripImageCard.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { hapticConfirm } from '../services/haptics.js';
import { leaveTrip } from '../services/sharing.js';
import { deleteTrip, listTrips, onTripsChanged } from '../services/tripsStore.js';
import { cascadeProps, useFirstShow, useMotionAllowed } from '../ui/motion.js';

/**
 * Séjours enregistrés sur l'appareil (historique), consultables hors ligne :
 * cartes à image, statut (en cours, à venir, terminé) en badge.
 */
export default function FavoritesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [trips, setTrips] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const { session, email, syncStatus } = useAuth();

  const load = () => listTrips().then(setTrips).catch(() => setTrips([]));
  useEffect(() => {
    load();
    // Liste mise à jour quand la synchronisation apporte ou supprime des séjours.
    return onTripsChanged(load);
  }, []);

  // Séjour d'un autre owner (séjour partagé) : on le quitte, on ne le supprime pas.
  const notMine = (trip) => Boolean(trip.ownerId && session?.user?.id && trip.ownerId !== session.user.id);
  const [failed, setFailed] = useState(false);
  const remove = async () => {
    setFailed(false);
    try {
      if (notMine(confirm)) await leaveTrip(confirm.id);
      else await deleteTrip(confirm.id);
    } catch {
      setFailed(true);
      return;
    }
    hapticConfirm();
    setConfirm(null);
    load();
  };
  // Cascade au premier affichage de la liste pendant la session seulement.
  const allowed = useMotionAllowed();
  const firstShow = useFirstShow('favorites');
  const animate = allowed && firstShow;

  return (
    <Page>
      <h2 className="text-2xl font-bold">{t('trips.title')}</h2>
      {session === null && (
        <Card className="space-y-3">
          <p>{t('auth.cta')}</p>
          <Button icon={UserRound} onClick={() => navigate('/account')} className="w-full">
            {t('auth.signInButton')}
          </Button>
        </Card>
      )}
      {session && (
        <p className="flex items-center gap-2 text-ink-muted">
          <CloudCheck aria-hidden="true" className="size-5 shrink-0" />
          <span>
            {t('auth.syncedWith', { email })} · {t(`sync.status.${syncStatus}`)}
          </span>
        </p>
      )}
      {trips === null && <Skeleton className="h-24 w-full" />}
      {trips?.length === 0 && (
        <Card>
          <EmptyState
            illustration="noTrips"
            title={t('trips.emptyTitle')}
            description={t('trips.emptyText')}
            action={
              <Button icon={CirclePlus} onClick={() => navigate('/create')}>
                {t('home.createCta')}
              </Button>
            }
          />
        </Card>
      )}
      <ul className="space-y-3">
        {trips?.map((trip, i) => (
          <m.li key={trip.id} {...cascadeProps(i, animate)}>
            <TripImageCard trip={trip} showStatus headingLevel={3}>
              {notMine(trip) ? (
                <Button variant="secondary" icon={LogOut} onClick={() => setConfirm(trip)} aria-label={t('trips.leaveNamed', { name: trip.title })}>
                  {t('sharing.leave')}
                </Button>
              ) : (
                <Button variant="secondary" icon={Trash2} onClick={() => setConfirm(trip)} aria-label={t('trips.deleteNamed', { name: trip.title })}>
                  {t('trips.delete')}
                </Button>
              )}
            </TripImageCard>
          </m.li>
        ))}
      </ul>
      {confirm && (
        <Dialog
          title={notMine(confirm) ? t('sharing.confirm.leave.title') : t('trips.confirmTitle')}
          onClose={() => {
            setConfirm(null);
            setFailed(false);
          }}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                {t('common.cancel')}
              </Button>
              <Button icon={notMine(confirm) ? LogOut : Trash2} onClick={remove}>
                {notMine(confirm) ? t('sharing.confirm.leave.action') : t('trips.confirm')}
              </Button>
            </>
          }
        >
          <p>{notMine(confirm) ? t('sharing.confirm.leave.text', { title: confirm.title }) : t('trips.confirmText', { name: confirm.title })}</p>
          {failed && (
            <p role="alert" className="mt-2 text-danger-on-soft">
              {t('sharing.errors.leaveOffline')}
            </p>
          )}
        </Dialog>
      )}
    </Page>
  );
}
