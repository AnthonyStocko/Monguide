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
