import { useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useAuth } from '../../hooks/useAuth.js';
import { getInstallMode, isStoragePersisted, promptInstall, requestPersistentStorage } from '../../platform/install.js';
import * as settings from '../../services/settings.js';
import { listTrips, onTripsChanged } from '../../services/tripsStore.js';
import { iosHelpDue, storageNoticeNeeded } from '../../utils/installHelp.js';
import Button from '../ui/Button.jsx';
import Dialog from '../ui/Dialog.jsx';
import IosInstallHelp from './IosInstallHelp.jsx';

/** { lastShownAt, declined } : aide de l'iPhone, au plus une fois par semaine. */
const IOS_HELP_KEY = 'install.iosHelp';
/** Message « Pour garder vos séjours sur cet appareil… » déjà affiché (une seule fois). */
const STORAGE_NOTICE_KEY = 'install.storageNotice';
/** navigator.storage.persist() déjà appelé (une seule demande : Firefox interroge l'utilisateur). */
const PERSIST_KEY = 'install.persistRequested';

/**
 * Version web, à partir du premier séjour enregistré : demande le stockage
 * durable au navigateur, puis propose, selon l'appareil, l'aide à
 * l'installation de l'iPhone ou le message sur la conservation des séjours.
 * Rien n'est jamais affiché dans l'application installée.
 */
export default function InstallCoach() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session } = useAuth();
  // Session encore inconnue au lancement : on attend de savoir.
  const signedIn = session === undefined ? null : Boolean(session);
  /** @type {[null | { kind: 'ios', showStorage: boolean } | { kind: 'storage', canInstall: boolean }, Function]} */
  const [view, setView] = useState(null);
  const open = useRef(false);
  open.current = view !== null;

  useEffect(() => {
    if (signedIn === null) return undefined;
    let cancelled = false;
    let busy = false;
    const check = async () => {
      if (busy || open.current) return;
      busy = true;
      try {
        if ((await listTrips()).length === 0) return;
        let persisted = await isStoragePersisted();
        if (!persisted && !(await settings.get(PERSIST_KEY, false))) {
          await settings.set(PERSIST_KEY, true);
          persisted = await requestPersistentStorage();
        }
        const mode = getInstallMode();
        if (cancelled || mode === 'installed') return;
        const noticeNeeded = storageNoticeNeeded({ mode, persisted, signedIn, alreadyShown: await settings.get(STORAGE_NOTICE_KEY, false) });
        if (mode === 'ios') {
          const state = await settings.get(IOS_HELP_KEY);
          if (!iosHelpDue(state, Date.now())) return;
          await settings.set(IOS_HELP_KEY, { ...state, lastShownAt: Date.now() });
          if (noticeNeeded) await settings.set(STORAGE_NOTICE_KEY, true);
          if (!cancelled) setView({ kind: 'ios', showStorage: noticeNeeded });
        } else if (noticeNeeded) {
          await settings.set(STORAGE_NOTICE_KEY, true);
          if (!cancelled) setView({ kind: 'storage', canInstall: mode === 'prompt' });
        }
      } catch {
        // Jamais bloquant : sans réponse du navigateur, rien n'est proposé.
      } finally {
        busy = false;
      }
    };
    check();
    const stop = onTripsChanged((id) => {
      if (id !== null) check();
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, [signedIn]);

  if (!view) return null;
  const close = () => setView(null);

  if (view.kind === 'ios') {
    const never = async () => {
      close();
      await settings.set(IOS_HELP_KEY, { lastShownAt: Date.now(), declined: true }).catch(() => {});
    };
    return <IosInstallHelp onClose={close} onNever={never} showStorage={view.showStorage} />;
  }

  return (
    <Dialog
      title={t('install.storageTitle')}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('common.close')}
          </Button>
          <Button
            onClick={() => {
              close();
              navigate('/account');
            }}
          >
            {t('auth.title')}
          </Button>
        </>
      }
    >
      <p>{t('install.storage')}</p>
      {view.canInstall && (
        <Button
          variant="secondary"
          icon={Download}
          onClick={() => {
            close();
            promptInstall();
          }}
        >
          {t('install.button')}
        </Button>
      )}
    </Dialog>
  );
}
