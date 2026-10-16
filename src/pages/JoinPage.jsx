import { useEffect, useState } from 'react';
import { CalendarDays, MapPin, Smartphone, UserRound, Users, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import SignIn from '../components/account/SignIn.jsx';
import Page from '../components/layout/Page.jsx';
import ProfileNameForm from '../components/sharing/ProfileNameForm.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { usePublicLinks } from '../config/links.js';
import { useAuth } from '../hooks/useAuth.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useFormat } from '../i18n/useFormat.js';
import { isNative } from '../platform/target.js';
import { joinTrip, myProfile, previewJoin } from '../services/sharing.js';
import { setCurrentTripId } from '../services/tripsStore.js';

/** Erreurs de trip-join -> message clair (jamais d'erreur technique). */
const ERRORS = {
  invite_expired: 'join.errors.expired',
  invite_revoked: 'join.errors.revoked',
  trip_full: 'join.errors.full',
  invite_invalid: 'join.errors.invalid'
};

/**
 * Lien d'invitation (/rejoindre/<jeton>), ouvert dans l'application
 * Android (App Links) ou la version web. Non connecté : connexion par code
 * puis retour ici. Connecté : aperçu (ville, dates, organisateur, nombre de
 * participants) servi seulement avec un jeton valide, puis « Rejoindre ce séjour ».
 */
export default function JoinPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();
  const { token } = useParams();
  const { session, loading } = useAuth();
  const online = useOnlineStatus();
  const links = usePublicLinks();
  const [state, setState] = useState({ status: 'loading' });
  const [hasName, setHasName] = useState(true);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!session || !online) return undefined;
    let alive = true;
    setState({ status: 'loading' });
    previewJoin(token)
      .then((preview) => alive && setState({ status: 'ready', preview }))
      .catch((err) => alive && setState({ status: 'error', key: ERRORS[err?.code] ?? (err?.code === 'offline' ? 'join.errors.offline' : 'join.errors.generic') }));
    myProfile()
      .then((p) => alive && setHasName(Boolean(p?.displayName)))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [session, online, token]);

  const open = async (tripId) => {
    await setCurrentTripId(tripId).catch(() => {});
    navigate(`/planning/${tripId}`, { replace: true });
  };

  const join = async () => {
    setJoining(true);
    try {
      const { tripId } = await joinTrip(token);
      await open(tripId);
    } catch (err) {
      setState({ status: 'error', key: ERRORS[err?.code] ?? 'join.errors.generic' });
    } finally {
      setJoining(false);
    }
  };

  const playStore = !isNative && links.playStore && (
    <Card className="flex items-start gap-3">
      <Smartphone aria-hidden="true" className="mt-1 size-5 shrink-0 text-ink-muted" />
      <p>
        {t('join.androidApp')}{' '}
        <a href={links.playStore} target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">
          {t('join.playStore')}
        </a>
      </p>
    </Card>
  );

  if (loading) {
    return (
      <Page>
        <Skeleton className="h-48 w-full" />
      </Page>
    );
  }

  if (!session) {
    return (
      <Page>
        <h2 className="text-2xl font-bold">{t('join.title')}</h2>
        <SignIn intro={t('join.signInIntro')} />
        {playStore}
      </Page>
    );
  }

  const p = state.preview;
  const dates = p && `${format.date(`${p.startDate}T12:00:00Z`, { day: 'numeric', month: 'long', timeZone: 'UTC' })} – ${format.date(`${p.endDate}T12:00:00Z`, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })}`;

  return (
    <Page>
      <h2 className="text-2xl font-bold">{t('join.title')}</h2>
      {!online && (
        <Card>
          <EmptyState icon={WifiOff} title={t('changes.offlineTitle')} description={t('join.errors.offline')} />
        </Card>
      )}
      {online && state.status === 'loading' && <Skeleton className="h-48 w-full" />}
      {online && state.status === 'error' && (
        <Card className="space-y-3">
          <p role="alert">{t(state.key)}</p>
          <Button variant="secondary" onClick={() => navigate('/')}>
            {t('join.home')}
          </Button>
        </Card>
      )}
      {online && state.status === 'ready' && (
        <Card className="space-y-4">
          <h3 className="text-xl font-semibold">{p.title}</h3>
          <ul className="space-y-2">
            {p.destination && (
              <li className="flex items-center gap-2">
                <MapPin aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
                {p.destination}
              </li>
            )}
            <li className="flex items-center gap-2">
              <CalendarDays aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
              {dates}
            </li>
            {p.ownerName && (
              <li className="flex items-center gap-2">
                <UserRound aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
                {t('join.organizer', { name: p.ownerName })}
              </li>
            )}
            <li className="flex items-center gap-2">
              <Users aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
              {t('join.memberCount', { count: p.memberCount })}
            </li>
          </ul>
          {p.alreadyMember ? (
            <>
              <p>{t('join.alreadyMember')}</p>
              <Button onClick={() => open(p.tripId)} className="w-full">
                {t('join.openTrip')}
              </Button>
            </>
          ) : p.full ? (
            <p role="alert">{t('join.errors.full')}</p>
          ) : (
            <>
              {!hasName && <ProfileNameForm onSaved={() => setHasName(true)} />}
              <Button onClick={join} disabled={joining || !hasName} icon={Users} className="w-full">
                {t('join.join')}
              </Button>
            </>
          )}
        </Card>
      )}
      {playStore}
    </Page>
  );
}
