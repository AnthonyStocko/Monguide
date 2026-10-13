import { beforeEach, describe, expect, it, vi } from 'vitest';

// Version web : les rappels sont envoyés par le serveur. Ces tests vérifient
// ce que l'application lui transmet (push-subscribe, push-schedule).

const state = vi.hoisted(() => ({
  prefs: new Map(),
  trips: [],
  calls: [],
  fail: null,
  subscription: { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } },
  installMode: 'installed'
}));

vi.mock('i18next', () => ({ default: { t: (key, values) => `${key}${values?.name ? `:${values.name}` : ''}`, resolvedLanguage: 'fr', on: () => {} } }));
vi.mock('../platform/notifications.js', () => ({
  LocalNotifications: { checkPermissions: async () => ({ display: 'granted' }) },
  remotePush: { getSubscription: async () => state.subscription }
}));
vi.mock('../platform/install.js', () => ({ getInstallMode: () => state.installMode }));
vi.mock('../platform/lifecycle.js', () => ({ onAppActive: () => () => {} }));
vi.mock('../platform/target.js', () => ({ isAndroid: false, isNative: false }));
vi.mock('./network.js', () => ({ onConnectionChange: () => () => {} }));
vi.mock('./rules.js', () => ({ getRules: () => ({ notifications: { eveningSummaryTime: '19:00', reminderLeadMin: 60 } }) }));
vi.mock('./settings.js', () => ({
  get: async (key, fallback = null) => (state.prefs.has(key) ? state.prefs.get(key) : fallback),
  set: async (key, value) => void state.prefs.set(key, structuredClone(value)),
  remove: async (key) => void state.prefs.delete(key)
}));
vi.mock('./tripsStore.js', () => ({
  listTrips: async () => state.trips,
  getTrip: async (id) => state.trips.find((t) => t.id === id) ?? null,
  onTripsChanged: () => () => {}
}));
vi.mock('./api.js', () => ({
  callFunction: async (name, { body }) => {
    if (state.fail) throw state.fail;
    state.calls.push({ name, body: structuredClone(body) });
    return { data: {} };
  }
}));

const { cancelAllNotifications, notificationsNeedInstall, reconcileNotifications, remoteReminders, rescheduleTrip } = await import('./notifications.js');

/** Séjour d'un jour, dans un an : une visite, une étape personnelle. */
const date = `${new Date().getUTCFullYear() + 1}-06-15`;
const trip = (id, start = '14:00') => ({
  id,
  title: 'Séjour à Lyon',
  timezone: 'Europe/Paris',
  lodgings: [],
  days: [
    {
      date,
      steps: [
        { id: 's1', start, end: '15:30', type: 'visit', place: { name: 'Musée des Confluences' } },
        { id: 's2', start: '17:00', end: '18:00', type: 'personal', title: 'Rendez-vous chez le notaire' }
      ]
    }
  ]
});
const schedules = () => state.calls.filter((c) => c.name === 'push-schedule');

beforeEach(() => {
  state.prefs.clear();
  state.trips = [trip('t1')];
  state.calls.length = 0;
  state.fail = null;
  state.installMode = 'installed';
});

describe('rappels de la version web', () => {
  it('abonne l’appareil puis envoie la liste complète du séjour', async () => {
    expect(remoteReminders).toBe(true);
    const result = await reconcileNotifications();
    expect(result).toMatchObject({ scheduled: 3, pending: 3 });
    const [subscribe, schedule] = state.calls;
    expect(subscribe.name).toBe('push-subscribe');
    expect(subscribe.body).toMatchObject({ subscription: state.subscription, lang: 'fr' });
    expect(subscribe.body.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(schedule.body).toMatchObject({ deviceId: subscribe.body.deviceId, tripId: 't1' });
    // Résumé de la veille et un rappel par étape, avec le lien vers le bon jour et la bonne étape.
    expect(schedule.body.reminders).toHaveLength(3);
    expect(schedule.body.reminders.map((r) => r.url)).toContain(`/planning/t1?day=${date}&step=s1`);
    for (const r of schedule.body.reminders) expect(Date.parse(r.sendAt)).toBeGreaterThan(Date.now());
  });

  it('le texte envoyé ne contient jamais le titre d’une étape personnelle', async () => {
    await reconcileNotifications();
    const text = JSON.stringify(schedules()[0].body.reminders);
    expect(text).toContain('Musée des Confluences');
    expect(text).not.toContain('notaire');
    expect(text).toContain('notifications.confidential.personalTitle');
  });

  it('liste inchangée : rien n’est renvoyé', async () => {
    await reconcileNotifications();
    await reconcileNotifications();
    await rescheduleTrip('t1');
    expect(schedules()).toHaveLength(1);
    expect(state.calls.filter((c) => c.name === 'push-subscribe')).toHaveLength(1);
  });

  it('horaire modifié : la liste complète est renvoyée, avec les mêmes identifiants', async () => {
    await reconcileNotifications();
    state.trips = [trip('t1', '15:00')];
    await rescheduleTrip('t1');
    const [before, after] = schedules().map((c) => c.body.reminders);
    expect(after.map((r) => r.key)).toEqual(before.map((r) => r.key));
    expect(after.find((r) => r.url.endsWith('step=s1')).sendAt).not.toBe(before.find((r) => r.url.endsWith('step=s1')).sendAt);
  });

  it('séjour supprimé : une liste vide remplace ses rappels', async () => {
    await reconcileNotifications();
    state.trips = [];
    await rescheduleTrip('t1');
    expect(schedules().at(-1).body).toMatchObject({ tripId: 't1', reminders: [] });
    // Plus rien à dire pour ce séjour ensuite.
    await reconcileNotifications();
    expect(schedules()).toHaveLength(2);
  });

  it('tous les séjours effacés : une liste vide par séjour connu du serveur', async () => {
    state.trips = [trip('t1'), trip('t2')];
    await reconcileNotifications();
    state.trips = [];
    await cancelAllNotifications();
    expect(schedules().slice(2).map((c) => [c.body.tripId, c.body.reminders.length])).toEqual([
      ['t1', 0],
      ['t2', 0]
    ]);
  });

  it('hors ligne : la liste reste à envoyer et part à l’essai suivant', async () => {
    state.fail = Object.assign(new Error('offline'), { code: 'offline' });
    const failed = await reconcileNotifications();
    expect(failed.error).toBe(state.fail);
    expect(schedules()).toHaveLength(0);
    state.fail = null;
    await reconcileNotifications();
    expect(schedules()).toHaveLength(1);
  });

  it('réglage « sur cet appareil » désactivé : les rappels déjà envoyés au serveur sont retirés', async () => {
    await reconcileNotifications();
    state.prefs.set('notifications.prefs', { device: false });
    await reconcileNotifications();
    expect(schedules().at(-1).body.reminders).toEqual([]);
  });

  it('sans permission (pas d’abonnement) : rien n’est envoyé', async () => {
    state.subscription = null;
    await expect(reconcileNotifications()).resolves.toMatchObject({ scheduled: 0 });
    expect(state.calls).toHaveLength(0);
    state.subscription = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'p', auth: 'a' } };
  });

  it('iPhone, application non installée : rappels proposés seulement après l’installation', () => {
    state.installMode = 'ios';
    expect(notificationsNeedInstall()).toBe(true);
    state.installMode = 'installed';
    expect(notificationsNeedInstall()).toBe(false);
  });
});
