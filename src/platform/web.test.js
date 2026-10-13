import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentPosition } from './geolocation.web.js';
import { hapticsAvailable, impactLight, notifyError, notifySuccess } from './haptics.web.js';
import { onAppActive } from './lifecycle.web.js';
import { getConnectionType, onConnectionChange } from './network.web.js';
import { LocalNotifications, remotePush } from './notifications.web.js';
import { shareFile } from './shareFile.web.js';

/** Cible d'événements minimale (document, window). */
function eventTarget(extra = {}) {
  const listeners = new Map();
  return {
    ...extra,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
    emit: (type) => listeners.get(type)?.(),
    count: () => listeners.size
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('géolocalisation (web)', () => {
  it('renvoie la position de navigator.geolocation, avec les options demandées', async () => {
    const position = { coords: { latitude: 45.9, longitude: 4.7 } };
    const getCurrent = vi.fn((resolve) => resolve(position));
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: getCurrent } });
    await expect(getCurrentPosition({ timeout: 15000 })).resolves.toBe(position);
    expect(getCurrent.mock.calls[0][2]).toEqual({ timeout: 15000 });
  });

  it('transmet le refus de permission (code 1)', async () => {
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (_ok, fail) => fail({ code: 1 }) } });
    await expect(getCurrentPosition({})).rejects.toEqual({ code: 1 });
  });

  it('navigateur sans géolocalisation : erreur "unavailable"', async () => {
    vi.stubGlobal('navigator', {});
    await expect(getCurrentPosition({})).rejects.toThrow('unavailable');
  });
});

describe('vibrations (web)', () => {
  it('sans effet, et réglage non proposé', async () => {
    expect(hapticsAvailable).toBe(false);
    await expect(Promise.all([impactLight(), notifySuccess(), notifyError()])).resolves.toEqual([undefined, undefined, undefined]);
  });
});

describe('cycle de vie (web)', () => {
  it('prévient au retour au premier plan seulement, jusqu’au désabonnement', () => {
    const doc = eventTarget({ visibilityState: 'hidden' });
    vi.stubGlobal('document', doc);
    const listener = vi.fn();
    const stop = onAppActive(listener);
    doc.emit('visibilitychange');
    expect(listener).not.toHaveBeenCalled();
    doc.visibilityState = 'visible';
    doc.emit('visibilitychange');
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    expect(doc.count()).toBe(0);
  });
});

describe('réseau (web)', () => {
  it('"unknown" en ligne, "none" hors ligne, suivi par les événements online et offline', async () => {
    const nav = { onLine: true };
    const win = eventTarget();
    vi.stubGlobal('navigator', nav);
    vi.stubGlobal('window', win);
    expect(await getConnectionType()).toBe('unknown');
    const listener = vi.fn();
    const stop = onConnectionChange(listener);
    nav.onLine = false;
    win.emit('offline');
    nav.onLine = true;
    win.emit('online');
    expect(listener.mock.calls).toEqual([['none'], ['unknown']]);
    stop();
    expect(win.count()).toBe(0);
  });
});

describe('notifications (web)', () => {
  it('navigateur sans Web Push : indisponibles, rien en attente, rien de programmé', async () => {
    vi.stubGlobal('navigator', {});
    await expect(LocalNotifications.checkPermissions()).resolves.toEqual({ display: 'unavailable' });
    await expect(LocalNotifications.requestPermissions()).resolves.toEqual({ display: 'unavailable' });
    await expect(remotePush.getSubscription()).resolves.toBeNull();
    await expect(LocalNotifications.getPending()).resolves.toEqual({ notifications: [] });
    await expect(LocalNotifications.schedule({ notifications: [{ id: 1 }] })).resolves.toBeUndefined();
    const handle = await LocalNotifications.addListener('localNotificationActionPerformed', () => {});
    await expect(handle.remove()).resolves.toBeUndefined();
  });
});

describe('remise d’un fichier (web)', () => {
  const blob = new Blob(['%PDF'], { type: 'application/pdf' });
  const file = { fileName: 'sejour.pdf', mimeType: 'application/pdf', title: 'Séjour', dialogTitle: 'Partager', toBase64: () => '', toBlob: () => blob };

  /** Faux document : le lien de téléchargement créé et cliqué. */
  function stubDownload() {
    const link = { click: vi.fn(), remove: vi.fn() };
    vi.stubGlobal('document', { createElement: () => link, body: { appendChild: vi.fn() } });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:pdf', revokeObjectURL: vi.fn() });
    vi.useFakeTimers();
    return link;
  }
  const touch = (coarse) => vi.stubGlobal('matchMedia', () => ({ matches: coarse }));

  it('appareil tactile qui partage des fichiers : feuille de partage avec le PDF', async () => {
    touch(true);
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { share, canShare: () => true });
    await expect(shareFile(file)).resolves.toEqual({ shared: true });
    const shared = share.mock.calls[0][0];
    expect(shared.title).toBe('Séjour');
    expect(shared.files[0].name).toBe('sejour.pdf');
    expect(shared.files[0].type).toBe('application/pdf');
  });

  it('partage annulé : pas d’erreur, pas de téléchargement', async () => {
    touch(true);
    const link = stubDownload();
    vi.stubGlobal('navigator', { share: async () => Promise.reject(Object.assign(new Error('x'), { name: 'AbortError' })), canShare: () => true });
    await expect(shareFile(file)).resolves.toEqual({ shared: true });
    expect(link.click).not.toHaveBeenCalled();
  });

  it('partage refusé par le navigateur : téléchargement', async () => {
    touch(true);
    const link = stubDownload();
    vi.stubGlobal('navigator', { share: async () => Promise.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' })), canShare: () => true });
    await expect(shareFile(file)).resolves.toEqual({ shared: false });
    expect(link.click).toHaveBeenCalledTimes(1);
  });

  it('ordinateur : téléchargement, même si le navigateur sait partager', async () => {
    touch(false);
    const link = stubDownload();
    const share = vi.fn();
    vi.stubGlobal('navigator', { share, canShare: () => true });
    await expect(shareFile(file)).resolves.toEqual({ shared: false });
    expect(share).not.toHaveBeenCalled();
    expect(link).toMatchObject({ href: 'blob:pdf', download: 'sejour.pdf' });
    expect(link.click).toHaveBeenCalledTimes(1);
  });

  it('navigateur sans partage de fichiers : téléchargement', async () => {
    touch(true);
    const link = stubDownload();
    vi.stubGlobal('navigator', { share: vi.fn(), canShare: () => false });
    await expect(shareFile(file)).resolves.toEqual({ shared: false });
    expect(link.click).toHaveBeenCalledTimes(1);
  });
});
