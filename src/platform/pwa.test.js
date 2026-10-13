import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Cible d'événements minimale (window, document). */
function eventTarget(extra = {}) {
  const listeners = new Map();
  return { ...extra, addEventListener: (type, fn) => listeners.set(type, fn), emit: (type, event) => listeners.get(type)?.(event) };
}

const WINDOWS_CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

beforeEach(() => vi.resetModules());
afterEach(() => vi.unstubAllGlobals());

describe('installation (web)', () => {
  /** Charge le module dans un faux navigateur. */
  async function load({ userAgent = WINDOWS_CHROME, standalone = false, navigatorStandalone, storage } = {}) {
    const win = eventTarget();
    vi.stubGlobal('window', win);
    vi.stubGlobal('matchMedia', () => ({ matches: standalone }));
    vi.stubGlobal('navigator', { userAgent, maxTouchPoints: 0, standalone: navigatorStandalone, storage });
    return { win, install: await import('./install.web.js') };
  }
  const promptEvent = (outcome) => ({ preventDefault: vi.fn(), prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome }) });

  it('ordinateur : le bouton apparaît avec beforeinstallprompt, sans bandeau du navigateur', async () => {
    const { win, install } = await load();
    expect(install.getInstallMode()).toBe('none');
    const listener = vi.fn();
    install.onInstallModeChange(listener);
    const event = promptEvent('accepted');
    win.emit('beforeinstallprompt', event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(install.getInstallMode()).toBe('prompt');
    expect(listener).toHaveBeenCalledTimes(1);

    await expect(install.promptInstall()).resolves.toBe(true);
    expect(event.prompt).toHaveBeenCalledTimes(1);
    // L'événement ne sert qu'une fois : le bouton disparaît.
    expect(install.getInstallMode()).toBe('none');
    await expect(install.promptInstall()).resolves.toBe(false);
  });

  it('installation refusée par l’utilisateur : false', async () => {
    const { win, install } = await load();
    win.emit('beforeinstallprompt', promptEvent('dismissed'));
    await expect(install.promptInstall()).resolves.toBe(false);
  });

  it('application installée (display-mode standalone ou navigator.standalone) : aucune aide', async () => {
    expect((await load({ standalone: true })).install.getInstallMode()).toBe('installed');
    vi.resetModules();
    expect((await load({ userAgent: IPHONE_SAFARI, navigatorStandalone: true })).install.getInstallMode()).toBe('installed');
  });

  it('Safari sur iPhone, non installée : écran d’aide', async () => {
    expect((await load({ userAgent: IPHONE_SAFARI })).install.getInstallMode()).toBe('ios');
  });

  it('stockage durable : réponse du navigateur, false s’il ne sait pas répondre', async () => {
    const granted = await load({ storage: { persisted: async () => false, persist: async () => true } });
    await expect(granted.install.isStoragePersisted()).resolves.toBe(false);
    await expect(granted.install.requestPersistentStorage()).resolves.toBe(true);
    vi.resetModules();
    const none = await load({ storage: undefined });
    await expect(none.install.isStoragePersisted()).resolves.toBe(false);
    await expect(none.install.requestPersistentStorage()).resolves.toBe(false);
  });
});

describe('mise à jour (web)', () => {
  it('prévient quand une version est prête et ne recharge qu’à la demande', async () => {
    const updateSW = vi.fn(async () => {});
    let options;
    vi.doMock('virtual:pwa-register', () => ({
      registerSW: (o) => {
        options = o;
        return updateSW;
      }
    }));
    vi.stubGlobal('navigator', { serviceWorker: {}, onLine: true });
    const doc = eventTarget({ visibilityState: 'visible' });
    vi.stubGlobal('document', doc);
    const update = await import('./appUpdate.web.js');

    const listener = vi.fn();
    update.onUpdateReady(listener);
    update.initAppUpdate();
    update.initAppUpdate();
    expect(update.isUpdateReady()).toBe(false);

    options.onNeedRefresh();
    expect(update.isUpdateReady()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(updateSW).not.toHaveBeenCalled();

    // Retour au premier plan : nouvelle version recherchée.
    const registration = { update: vi.fn(async () => {}) };
    options.onRegisteredSW('/sw.js', registration);
    doc.emit('visibilitychange');
    expect(registration.update).toHaveBeenCalledTimes(1);

    await update.applyUpdate();
    expect(updateSW).toHaveBeenCalledWith(true);
  });

  it('navigateur sans service worker : rien à enregistrer', async () => {
    const registerSW = vi.fn();
    vi.doMock('virtual:pwa-register', () => ({ registerSW }));
    vi.stubGlobal('navigator', {});
    const update = await import('./appUpdate.web.js');
    update.initAppUpdate();
    expect(registerSW).not.toHaveBeenCalled();
    await expect(update.applyUpdate()).resolves.toBeUndefined();
  });
});

describe('rappels (web)', () => {
  const KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';

  /** Charge l'adaptateur dans un faux navigateur compatible Web Push. */
  async function load({ permission = 'default', existing = null } = {}) {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', KEY);
    const subscription = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } }) };
    const pushManager = { getSubscription: vi.fn(async () => existing && subscription), subscribe: vi.fn(async () => subscription) };
    const serviceWorker = { ...eventTarget(), removeEventListener: vi.fn(), getRegistration: async () => ({}), ready: Promise.resolve({ pushManager }) };
    const notification = { permission, requestPermission: vi.fn(async () => 'granted') };
    vi.stubGlobal('Notification', notification);
    vi.stubGlobal('PushManager', function PushManager() {});
    vi.stubGlobal('navigator', { serviceWorker });
    return { pushManager, serviceWorker, notification, adapter: await import('./notifications.web.js') };
  }
  afterEach(() => vi.unstubAllEnvs());

  it('permission jamais demandée au chargement : seulement par requestPermissions', async () => {
    const { notification, adapter } = await load();
    await expect(adapter.LocalNotifications.checkPermissions()).resolves.toEqual({ display: 'prompt' });
    expect(notification.requestPermission).not.toHaveBeenCalled();
    await expect(adapter.remotePush.getSubscription()).resolves.toBeNull();
    await expect(adapter.LocalNotifications.requestPermissions()).resolves.toEqual({ display: 'granted' });
    expect(notification.requestPermission).toHaveBeenCalledTimes(1);
  });

  it('permission accordée : abonnement créé avec la clé publique du serveur, puis réutilisé', async () => {
    const created = await load({ permission: 'granted' });
    await expect(created.adapter.remotePush.getSubscription()).resolves.toEqual({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', keys: { p256dh: 'p', auth: 'a' } });
    const options = created.pushManager.subscribe.mock.calls[0][0];
    expect(options.userVisibleOnly).toBe(true);
    expect(options.applicationServerKey).toHaveLength(65);
    vi.resetModules();
    const reused = await load({ permission: 'granted', existing: true });
    await reused.adapter.remotePush.getSubscription();
    expect(reused.pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('sans clé VAPID configurée : rappels indisponibles', async () => {
    const { adapter } = await load({ permission: 'granted' });
    vi.resetModules();
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '');
    const unconfigured = await import('./notifications.web.js');
    await expect(unconfigured.LocalNotifications.checkPermissions()).resolves.toEqual({ display: 'unavailable' });
    await expect(adapter.LocalNotifications.checkPermissions()).resolves.toEqual({ display: 'granted' });
  });

  it('appui sur une notification, application ouverte : le lien du service worker est transmis', async () => {
    const { serviceWorker, adapter } = await load({ permission: 'granted' });
    const listener = vi.fn();
    await adapter.LocalNotifications.addListener('localNotificationActionPerformed', listener);
    serviceWorker.emit('message', { data: { type: 'autre' } });
    serviceWorker.emit('message', { data: { type: 'monguide:open-url', url: '/planning/t1?day=2026-10-20&step=s1' } });
    expect(listener.mock.calls).toEqual([[{ notification: { extra: { url: '/planning/t1?day=2026-10-20&step=s1' } } }]]);
  });
});
