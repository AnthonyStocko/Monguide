import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft, Copy, Link2, LogOut, Mail, RefreshCw, Share2, UserMinus, WifiOff, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import Page from '../components/layout/Page.jsx';
import Avatar from '../components/sharing/Avatar.jsx';
import ProfileNameDialog from '../components/sharing/ProfileNameDialog.jsx';
import Badge from '../components/ui/Badge.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import FieldError from '../components/ui/FieldError.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useOnlineStatus } from '../hooks/useOnlineStatus.js';
import { useFormat } from '../i18n/useFormat.js';
import { shareLink } from '../platform/shareLink.js';
import {
  createInviteLink,
  currentUserId,
  inviteByEmail,
  leaveTrip,
  myProfile,
  removeMember,
  revokeInvite,
  tripInvites,
  tripMembers
} from '../services/sharing.js';
import { getTrip } from '../services/tripsStore.js';

/**
 * « Participants » d'un séjour du compte : liste des membres ; owner :
 * lien d'invitation (Copier, Partager, Désactiver, Créer un nouveau lien),
 * invitation par e-mail, « Retirer » ; editor : « Quitter ce séjour ».
 * En ligne seulement.
 */
export default function ParticipantsPage() {
  const { t } = useTranslation();
  const format = useFormat();
  const navigate = useNavigate();
  const { tripId } = useParams();
  const { session } = useAuth();
  const online = useOnlineStatus();
  const [trip, setTrip] = useState(null);
  const [me, setMe] = useState(null);
  const [data, setData] = useState({ status: 'loading' });
  const [notice, setNotice] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [askName, setAskName] = useState(null);
  const [email, setEmail] = useState('');
  const [emailState, setEmailState] = useState({ status: 'idle' });

  const load = useCallback(async () => {
    try {
      const members = await tripMembers(tripId);
      const userId = await currentUserId();
      const owner = members.find((m) => m.role === 'owner')?.user_id === userId;
      const invites = owner ? await tripInvites(tripId) : { link: null, emails: [] };
      setMe(userId);
      setData({ status: 'ready', members, owner, invites });
    } catch {
      setData({ status: 'error' });
    }
  }, [tripId]);

  useEffect(() => {
    getTrip(tripId)
      .then(setTrip)
      .catch(() => setTrip(null));
  }, [tripId]);
  useEffect(() => {
    if (!session || !online) return;
    load();
  }, [session, online, load]);

  const city = trip?.destination?.name ?? trip?.title ?? '';
  const inviteText = (url) => t('sharing.inviteText', { city, url });
  const errorText = (err) => t(err?.code === 'rate_limited' || err?.code === 'invite_limit' ? 'sharing.errors.inviteLimit' : (err?.messageKey ?? 'errors.unknown'));

  /** Premier partage : prénom demandé s'il manque, puis l'action. */
  const withName = async (action) => {
    const profile = await myProfile().catch(() => null);
    if (profile?.displayName) return action();
    setAskName(() => action);
  };

  const run = async (fn) => {
    setNotice(null);
    try {
      await fn();
    } catch (err) {
      setNotice({ tone: 'error', text: errorText(err) });
    }
  };

  const share = async (url) => {
    const { shared } = await shareLink({ title: t('sharing.shareTitle'), text: inviteText(url), dialogTitle: t('sharing.shareTitle') });
    if (!shared) await copy(url);
  };
  const copy = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      setNotice({ tone: 'ok', text: t('sharing.copied') });
    } catch {
      setNotice({ tone: 'error', text: t('sharing.copyFailed') });
    }
  };
  const newLink = () =>
    withName(() =>
      run(async () => {
        const link = await createInviteLink(tripId);
        await load();
        await share(link.url);
      })
    );
  /** Lien à transmettre : celui de cet appareil, sinon un nouveau. */
  const usableLink = async () => {
    const current = data.invites?.link;
    if (current?.url) return current.url;
    const link = await createInviteLink(tripId);
    await load();
    return link.url;
  };

  const sendEmail = (e) => {
    e.preventDefault();
    withName(async () => {
      setEmailState({ status: 'sending' });
      try {
        await inviteByEmail(tripId, email);
        setEmailState({ status: 'recorded', email: email.trim() });
        setEmail('');
        await load();
      } catch (err) {
        setEmailState({ status: 'error', text: err?.code === 'invalid_input' ? t('sharing.errors.emailInvalid') : errorText(err) });
      }
    });
  };
  const mailLink = () =>
    run(async () => {
      const url = await usableLink();
      const subject = encodeURIComponent(t('sharing.mailSubject', { city }));
      const body = encodeURIComponent(inviteText(url));
      window.location.href = `mailto:${encodeURIComponent(emailState.email)}?subject=${subject}&body=${body}`;
    });

  const back = (
    <Link to={`/planning/${tripId}`} className="inline-flex min-h-12 items-center gap-1 font-semibold underline underline-offset-2">
      <ChevronLeft aria-hidden="true" className="size-5" />
      {t('changes.back')}
    </Link>
  );

  if (!session || !trip || !Number.isInteger(trip.version)) {
    return (
      <Page>
        {back}
        <h2 className="text-2xl font-bold">{t('sharing.title')}</h2>
        <Card>
          <p>{session ? t('sharing.notSynced') : t('sharing.signInFirst')}</p>
          {!session && (
            <Button className="mt-3 w-full" onClick={() => navigate('/account')}>
              {t('auth.signInButton')}
            </Button>
          )}
        </Card>
      </Page>
    );
  }

  const link = data.invites?.link;
  return (
    <Page>
      {back}
      <h2 className="text-2xl font-bold">{t('sharing.title')}</h2>
      <p className="text-ink-muted">{trip.title}</p>

      {!online && (
        <Card>
          <EmptyState icon={WifiOff} title={t('changes.offlineTitle')} description={t('sharing.offline')} />
        </Card>
      )}
      {online && data.status === 'loading' && <Skeleton className="h-40 w-full" />}
      {online && data.status === 'error' && (
        <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-danger-on-soft">
          {t('sharing.errors.load')}
        </p>
      )}
      {notice && (
        <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-3 py-2 ${notice.tone === 'error' ? 'bg-danger-soft text-danger-on-soft' : 'bg-secondary-soft text-secondary-on-soft'}`}>
          {notice.text}
        </p>
      )}

      {online && data.status === 'ready' && (
        <>
          <Card className="space-y-3">
            <h3 className="text-lg font-semibold">{t('sharing.members', { count: data.members.length })}</h3>
            <ul className="space-y-2">
              {data.members.map((m) => {
                const name = m.profile?.display_name ?? t('changes.someone');
                return (
                  <li key={m.user_id} className="flex items-center gap-3">
                    <Avatar name={name} color={m.profile?.avatar_color} userId={m.user_id} />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words font-medium">
                        {name}
                        {m.user_id === me ? ` ${t('sharing.you')}` : ''}
                      </span>
                      <Badge tone={m.role === 'owner' ? 'primary' : 'neutral'}>{t(`sharing.roles.${m.role}`)}</Badge>
                    </span>
                    {data.owner && m.role !== 'owner' && (
                      <Button variant="ghost" icon={UserMinus} onClick={() => setConfirm({ kind: 'remove', member: m, name })}>
                        {t('sharing.remove')}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          {data.owner && (
            <Card className="space-y-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <Link2 aria-hidden="true" className="size-5" />
                {t('sharing.linkTitle')}
              </h3>
              <p className="text-ink-muted">{t('sharing.linkHelp')}</p>
              {link ? (
                <>
                  <p>{t('sharing.linkActive', { date: format.date(link.expiresAt, { dateStyle: 'long', timeStyle: 'short' }) })}</p>
                  {link.url ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Button variant="secondary" icon={Copy} onClick={() => copy(link.url)}>
                        {t('sharing.copy')}
                      </Button>
                      <Button variant="secondary" icon={Share2} onClick={() => withName(() => run(() => share(link.url)))}>
                        {t('sharing.share')}
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-ink-muted">{t('sharing.linkOtherDevice')}</p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button variant="ghost" icon={XCircle} onClick={() => setConfirm({ kind: 'revoke', inviteId: link.inviteId })}>
                      {t('sharing.revoke')}
                    </Button>
                    <Button variant="ghost" icon={RefreshCw} onClick={newLink}>
                      {t('sharing.newLink')}
                    </Button>
                  </div>
                </>
              ) : (
                <Button icon={Link2} onClick={newLink} className="w-full">
                  {t('sharing.createLink')}
                </Button>
              )}
            </Card>
          )}

          {data.owner && (
            <Card className="space-y-3">
              <h3 className="flex items-center gap-2 text-lg font-semibold">
                <Mail aria-hidden="true" className="size-5" />
                {t('sharing.emailTitle')}
              </h3>
              <p className="text-ink-muted">{t('sharing.emailHelp')}</p>
              <form noValidate onSubmit={sendEmail} className="space-y-2">
                <label htmlFor="invite-email" className="block font-medium">
                  {t('auth.email')}
                </label>
                <input
                  id="invite-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-describedby={emailState.status === 'error' ? 'invite-email-error' : undefined}
                  className="min-h-12 w-full rounded-xl border-2 border-ink-muted bg-surface px-3 text-base"
                />
                <FieldError id="invite-email-error">{emailState.status === 'error' ? emailState.text : null}</FieldError>
                <Button type="submit" icon={Mail} disabled={!email.trim() || emailState.status === 'sending'} className="w-full">
                  {t('sharing.invite')}
                </Button>
              </form>
              {emailState.status === 'recorded' && (
                <div role="status" className="space-y-2 rounded-xl bg-secondary-soft p-3 text-secondary-on-soft">
                  <p>{t('sharing.emailRecorded')}</p>
                  <Button variant="secondary" icon={Share2} onClick={mailLink}>
                    {t('sharing.sendLinkToPerson')}
                  </Button>
                </div>
              )}
              {data.invites.emails.length > 0 && (
                <ul className="space-y-2">
                  {data.invites.emails.map((i) => (
                    <li key={i.id} className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 break-all">
                        {i.email}
                        <span className="block text-sm text-ink-muted">{t('sharing.pendingUntil', { date: format.date(i.expiresAt, { dateStyle: 'medium' }) })}</span>
                      </span>
                      <Button variant="ghost" icon={XCircle} onClick={() => run(async () => (await revokeInvite(tripId, i.id), load()))}>
                        {t('sharing.cancelInvite')}
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {!data.owner && (
            <Button variant="secondary" icon={LogOut} onClick={() => setConfirm({ kind: 'leave' })} className="w-full">
              {t('sharing.leave')}
            </Button>
          )}
        </>
      )}

      {confirm && (
        <Dialog
          title={t(`sharing.confirm.${confirm.kind}.title`)}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={() =>
                  run(async () => {
                    const c = confirm;
                    setConfirm(null);
                    if (c.kind === 'remove') await removeMember(tripId, c.member.user_id);
                    if (c.kind === 'revoke') await revokeInvite(tripId, c.inviteId);
                    if (c.kind === 'leave') {
                      await leaveTrip(tripId);
                      navigate('/favorites');
                      return;
                    }
                    await load();
                  })
                }
              >
                {t(`sharing.confirm.${confirm.kind}.action`)}
              </Button>
            </>
          }
        >
          <p>{t(`sharing.confirm.${confirm.kind}.text`, { name: confirm.name ?? '', title: trip.title })}</p>
        </Dialog>
      )}
      {askName && (
        <ProfileNameDialog
          onClose={() => setAskName(null)}
          onDone={() => {
            const action = askName;
            setAskName(null);
            action();
          }}
        />
      )}
    </Page>
  );
}
