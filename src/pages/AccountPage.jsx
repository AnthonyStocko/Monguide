import { useState } from 'react';
import { LogOut, RefreshCw, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SignIn from '../components/account/SignIn.jsx';
import ProfileNameForm from '../components/sharing/ProfileNameForm.jsx';
import Page from '../components/layout/Page.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { endSession, syncNow } from '../services/sync.js';

/** Compte connecté : état de synchronisation, déconnexion (garder ou effacer les séjours). */
function Account() {
  const { t } = useTranslation();
  const { email, syncStatus } = useAuth();
  const [confirm, setConfirm] = useState(false);

  const signOut = (erase) => endSession({ erase });

  return (
    <Card className="space-y-4">
      <p className="flex items-center gap-2">
        <UserRound aria-hidden="true" className="size-6 text-primary-strong" />
        <span>{t('auth.signedInAs', { email })}</span>
      </p>
      <p className="text-ink-muted">{t(`sync.status.${syncStatus}`)}</p>
      <Button variant="secondary" icon={RefreshCw} onClick={() => syncNow()} disabled={syncStatus === 'syncing'} className="w-full">
        {t('sync.now')}
      </Button>
      <ProfileNameForm />
      <Button variant="secondary" icon={LogOut} onClick={() => setConfirm(true)} className="w-full">
        {t('auth.signOut')}
      </Button>
      {confirm && (
        <Dialog
          title={t('auth.signOutTitle')}
          onClose={() => setConfirm(false)}
          footer={
            <>
              <Button variant="secondary" onClick={() => signOut(false)}>
                {t('auth.keepTrips')}
              </Button>
              <Button onClick={() => signOut(true)}>{t('auth.eraseTrips')}</Button>
            </>
          }
        >
          <p>{t('auth.signOutText')}</p>
        </Dialog>
      )}
    </Card>
  );
}

export default function AccountPage() {
  const { session, loading } = useAuth();
  return <Page>{loading ? <Skeleton className="h-48 w-full" /> : session ? <Account /> : <SignIn />}</Page>;
}
