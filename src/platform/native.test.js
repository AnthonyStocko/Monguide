import { beforeEach, describe, expect, it, vi } from 'vitest';

// Plugins Capacitor simulés : les implémentations natives doivent les appeler
// exactement comme l'application Android le faisait avant les adaptateurs.
const plugins = vi.hoisted(() => ({
  prefs: new Map(),
  impact: vi.fn(),
  notification: vi.fn(),
  getPosition: vi.fn(async () => ({ coords: { latitude: 1, longitude: 2 } })),
  writeFile: vi.fn(async () => ({ uri: 'file:///cache/sejour.pdf' })),
  share: vi.fn(async () => {}),
  listeners: new Map(),
  removed: []
}));
const addListener = (type, fn) => {
  plugins.listeners.set(type, fn);
  return Promise.resolve({ remove: async () => void plugins.removed.push(type) });
};

vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: async ({ key }) => ({ value: plugins.prefs.has(key) ? plugins.prefs.get(key) : null }),
    set: async ({ key, value }) => void plugins.prefs.set(key, value),
    remove: async ({ key }) => void plugins.prefs.delete(key)
  }
}));
vi.mock('@capacitor/haptics', () => ({
  Haptics: { impact: plugins.impact, notification: plugins.notification },
  ImpactStyle: { Light: 'LIGHT' },
  NotificationType: { Success: 'SUCCESS', Error: 'ERROR' }
}));
vi.mock('@capacitor/geolocation', () => ({ Geolocation: { getCurrentPosition: plugins.getPosition } }));
vi.mock('@capacitor/filesystem', () => ({ Directory: { Cache: 'CACHE' }, Filesystem: { writeFile: plugins.writeFile } }));
vi.mock('@capacitor/share', () => ({ Share: { share: plugins.share } }));
vi.mock('@capacitor/app', () => ({ App: { addListener } }));
vi.mock('@capacitor/network', () => ({ Network: { getStatus: async () => ({ connectionType: 'wifi' }), addListener } }));

const preferences = await import('./preferences.native.js');
const haptics = await import('./haptics.native.js');
const geolocation = await import('./geolocation.native.js');
const { shareFile } = await import('./shareFile.native.js');
const { onAppActive } = await import('./lifecycle.native.js');
const network = await import('./network.native.js');

beforeEach(() => {
  vi.clearAllMocks();
  plugins.listeners.clear();
  plugins.removed.length = 0;
});

describe('implémentations natives (plugins Capacitor)', () => {
  it('réglages : @capacitor/preferences, null si la clé est absente', async () => {
    expect(await preferences.getItem('language')).toBeNull();
    await preferences.setItem('language', '"fr"');
    expect(await preferences.getItem('language')).toBe('"fr"');
    await preferences.removeItem('language');
    expect(await preferences.getItem('language')).toBeNull();
  });

  it('vibrations : impact léger, notifications de réussite et d’erreur', async () => {
    expect(haptics.hapticsAvailable).toBe(true);
    await haptics.impactLight();
    await haptics.notifySuccess();
    await haptics.notifyError();
    expect(plugins.impact).toHaveBeenCalledWith({ style: 'LIGHT' });
    expect(plugins.notification.mock.calls).toEqual([[{ type: 'SUCCESS' }], [{ type: 'ERROR' }]]);
  });

  it('géolocalisation : options transmises au plugin', async () => {
    const options = { enableHighAccuracy: true, timeout: 15000 };
    await expect(geolocation.getCurrentPosition(options)).resolves.toEqual({ coords: { latitude: 1, longitude: 2 } });
    expect(plugins.getPosition).toHaveBeenCalledWith(options);
  });

  it('fichier : écrit dans le cache puis partagé ; un partage annulé n’est pas une erreur', async () => {
    const file = { fileName: 'sejour.pdf', mimeType: 'application/pdf', title: 'Séjour', dialogTitle: 'Partager', toBase64: () => 'QUJD', toBlob: () => null };
    await expect(shareFile(file)).resolves.toEqual({ shared: true });
    expect(plugins.writeFile).toHaveBeenCalledWith({ path: 'sejour.pdf', data: 'QUJD', directory: 'CACHE' });
    expect(plugins.share).toHaveBeenCalledWith({ title: 'Séjour', dialogTitle: 'Partager', files: ['file:///cache/sejour.pdf'] });

    plugins.share.mockRejectedValueOnce(new Error('Share canceled'));
    await expect(shareFile(file)).resolves.toEqual({ shared: true });
    plugins.share.mockRejectedValueOnce(new Error('No activity found'));
    await expect(shareFile(file)).rejects.toThrow('No activity found');
  });

  it('cycle de vie : retour au premier plan seulement, puis désabonnement', async () => {
    const listener = vi.fn();
    const stop = onAppActive(listener);
    plugins.listeners.get('appStateChange')({ isActive: false });
    expect(listener).not.toHaveBeenCalled();
    plugins.listeners.get('appStateChange')({ isActive: true });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    await vi.waitFor(() => expect(plugins.removed).toEqual(['appStateChange']));
  });

  it('réseau : type de connexion du plugin et suivi des changements', async () => {
    expect(await network.getConnectionType()).toBe('wifi');
    const listener = vi.fn();
    const stop = network.onConnectionChange(listener);
    plugins.listeners.get('networkStatusChange')({ connectionType: 'cellular' });
    expect(listener).toHaveBeenCalledWith('cellular');
    stop();
    await vi.waitFor(() => expect(plugins.removed).toEqual(['networkStatusChange']));
  });
});
