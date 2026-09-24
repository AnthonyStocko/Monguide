import { useEffect, useState } from 'react';
import { KeyRound, LogOut, Mail, RefreshCw, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Page from '../components/layout/Page.jsx';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Dialog from '../components/ui/Dialog.jsx';
import FieldError from '../components/ui/FieldError.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useConfig } from '../hooks/useConfig.js';
import { authApi } from '../services/api.js';
import { endSession, syncNow } from '../services/sync.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Connexion par code reçu par e-mail : saisie de l'e-mail, puis du code. */
function SignIn() {
  const { t } = useTranslation();
  const { rules } = useConfig().config;
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return undefined;
    const timer = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(timer);
  }, [wait]);

  const send = async (e) => {
    e?.preventDefault();
    if (!EMAIL_RE.test(email.trim())) return setError('auth.errors.emailInvalid');
    setBusy(true);
    setError(null);
    try {
      await authApi.sendCode(email.trim());
      setStep('code');
      setWait(rules.auth.resendDelaySec);
    } catch (err) {
      setError(err.messageKey ?? 'errors.unknown');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (e) => {
    e.preventDefault();
    if (!new RegExp(`^\\d{${rules.auth.otpLength}}$`).test(code)) return setError('auth.errors.codeFormat');
    setBusy(true);
    setError(null);
    try {
      await authApi.verifyCode(email.trim(), code);
    } catch (err) {
      setError(err.messageKey ?? 'errors.unknown');
    } finally {
      setBusy(false);
    }
  };

  const errorText = error && t(error, { length: rules.auth.otpLength });

  return step === 'email' ? (
    <Card as="form" noValidate onSubmit={send} className="space-y-4">
      <p>{t('auth.intro')}</p>
      <div className="space-y-1">
        <label htmlFor="email" className="block font-medium">
          {t('auth.email')}
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'email-error' : undefined}
          className="min-h-12 w-full rounded-xl border-2 border-ink-muted bg-surface px-3 text-base"
        />
        <FieldError id="email-error">{errorText}</FieldError>
      </div>
      <Button type="submit" icon={Mail} disabled={busy} className="w-full">
        {t('auth.sendCode')}
      </Button>
      <p className="text-ink-muted">{t('auth.guestNote')}</p>
    </Card>
  ) : (
    <Card as="form" noValidate onSubmit={verify} className="space-y-4">
      <p>{t('auth.codeSent', { email: email.trim(), length: rules.auth.otpLength })}</p>
      <div className="space-y-1">
        <label htmlFor="code" className="block font-medium">
          {t('auth.code', { length: rules.auth.otpLength })}
        </label>
        <input
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={rules.auth.otpLength}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'code-error' : undefined}
          className="min-h-12 w-full rounded-xl border-2 border-ink-muted bg-surface px-3 text-center text-2xl tracking-[0.4em]"
        />
        <FieldError id="code-error">{errorText}</FieldError>
      </div>
      <Button type="submit" icon={KeyRound} disabled={busy} className="w-full">
        {t('auth.signIn')}
      </Button>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="secondary" onClick={() => send()} disabled={busy || wait > 0}>
          {wait > 0 ? t('auth.resendIn', { seconds: wait }) : t('auth.resend')}
        </Button>
        <Button variant="ghost" onClick={() => setStep('email')}>
          {t('auth.changeEmail')}
        </Button>
      </div>
    </Card>
  );
}

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
