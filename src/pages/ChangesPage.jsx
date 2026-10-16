import { useEffect, useState } from 'react';
import { ChevronLeft, History, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import Page from '../components/layout/Page.jsx';
import Card from '../components/ui/Card.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { avatarColor } from '../config/avatarColors.js';
import { useFormat } from '../i18n/useFormat.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { tripChanges } from '../services/sharing.js';
import { getTrip } from '../services/tripsStore.js';

/**
 * « Modifications » d'un séjour partagé : historique (trip_changes), du plus
 * récent au plus ancien, avec le prénom et la pastille de couleur de
 * l'auteur, et l'heure relative. En ligne seulement ; pas de retour arrière
 * dans cette version.
 */
export default function ChangesPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const { tripId } = useParams();
  const online = useOnlineStatus();
  const [trip, setTrip] = useState(null);
  const [state, setState] = useState({ status: 'loading', changes: [] });

  useEffect(() => {
    getTrip(tripId)
      .then(setTrip)
      .catch(() => setTrip(null));
  }, [tripId]);

  useEffect(() => {
    if (!online) {
      setState({ status: 'offline', changes: [] });
      return undefined;
    }
    let alive = true;
    setState((s) => ({ ...s, status: 'loading' }));
    tripChanges(tripId)
      .then((changes) => alive && setState({ status: 'ready', changes }))
      .catch(() => alive && setState({ status: 'error', changes: [] }));
    return () => {
      alive = false;
    };
  }, [tripId, online]);

  const author = (c) => (c.author_id ? (c.author?.display_name ?? t('changes.someone')) : t('changes.formerMember'));

  return (
    <Page>
      <Link to={`/planning/${tripId}`} className="inline-flex min-h-12 items-center gap-1 font-semibold underline underline-offset-2">
        <ChevronLeft aria-hidden="true" className="size-5" />
        {t('changes.back')}
      </Link>
      <h2 className="text-2xl font-bold">{t('changes.title')}</h2>
      {trip && <p className="text-ink-muted">{trip.title}</p>}
      {t('changes.languageNote') && <p className="text-sm text-ink-muted">{t('changes.languageNote')}</p>}

      {state.status === 'loading' && [0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      {state.status === 'offline' && (
        <Card>
          <EmptyState icon={WifiOff} title={t('changes.offlineTitle')} description={t('changes.offline')} />
        </Card>
      )}
      {state.status === 'error' && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-danger-on-soft">
          {t('changes.error')}
        </p>
      )}
      {state.status === 'ready' && state.changes.length === 0 && (
        <Card>
          <EmptyState icon={History} title={t('changes.emptyTitle')} description={t('changes.empty')} />
        </Card>
      )}
      {state.status === 'ready' && state.changes.length > 0 && (
        <ol className="space-y-2">
          {state.changes.map((c) => {
            const name = author(c);
            return (
              <li key={c.id}>
                <Card className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
                    style={{ backgroundColor: avatarColor(c.author?.avatar_color, c.author_id ?? '') }}
                  >
                    {name.trim().charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-words">
                      <span className="font-semibold">{name}</span> {c.summary}
                    </span>
                    <time dateTime={c.created_at} className="block text-sm text-ink-muted">
                      {format.relative(c.created_at)}
                    </time>
                  </span>
                </Card>
              </li>
            );
          })}
        </ol>
      )}
    </Page>
  );
}
