import { beforeEach, describe, expect, it, vi } from 'vitest';

const live = { onChange: null, subscribed: 0, unsubscribed: 0, hidden: null, active: null };
vi.mock('./sharing.js', () => ({
  currentUserId: async () => 'me',
  markSeen: vi.fn(async () => {}),
  subscribeTripChanges: (_id, onChange) => {
    live.onChange = onChange;
    live.subscribed += 1;
    return () => {
      live.unsubscribed += 1;
      live.onChange = null;
    };
  }
}));
const refreshTrip = vi.fn(async () => {});
vi.mock('./sync.js', () => ({ refreshTrip: (id) => refreshTrip(id) }));
vi.mock('../platform/lifecycle.js', () => ({
  onAppHidden: (l) => ((live.hidden = l), () => (live.hidden = null)),
  onAppActive: (l) => ((live.active = l), () => (live.active = null))
}));

const { startLiveTrip } = await import('./liveTrip.js');

beforeEach(() => {
  Object.assign(live, { onChange: null, subscribed: 0, unsubscribed: 0 });
  vi.clearAllMocks();
});

describe('startLiveTrip', () => {
  it('modification d’un autre : prévenu, version plus récente récupérée ; la sienne : pas de message', async () => {
    let version = 3;
    const onRemoteChange = vi.fn();
    const stop = startLiveTrip({ tripId: 't', getVersion: () => version, onRemoteChange });
    await stop.ready;
    expect(live.subscribed).toBe(1);
    expect(refreshTrip).toHaveBeenCalledTimes(1);

    live.onChange({ author_id: 'paul', version: 4, summary: 'a déplacé « Dîner » à 20:00 (samedi)' });
    expect(onRemoteChange).toHaveBeenCalledWith(expect.objectContaining({ author_id: 'paul' }));
    expect(refreshTrip).toHaveBeenCalledTimes(2);
    version = 4;

    live.onChange({ author_id: 'me', version: 5 });
    expect(onRemoteChange).toHaveBeenCalledTimes(1);
    expect(refreshTrip).toHaveBeenCalledTimes(3);

    // Version déjà affichée : rien à récupérer.
    version = 5;
    live.onChange({ author_id: 'paul', version: 5 });
    expect(refreshTrip).toHaveBeenCalledTimes(3);
    stop();
    expect(live.unsubscribed).toBe(1);
  });

  it('arrière-plan : désabonné ; retour : réabonné et dernière version récupérée', async () => {
    const stop = startLiveTrip({ tripId: 't', getVersion: () => 1, onRemoteChange: () => {} });
    await stop.ready;
    live.hidden();
    expect(live.unsubscribed).toBe(1);
    expect(live.onChange).toBeNull();
    refreshTrip.mockClear();
    live.active();
    expect(live.subscribed).toBe(2);
    expect(refreshTrip).toHaveBeenCalledWith('t');
    stop();
    expect(live.active).toBeNull();
    expect(live.hidden).toBeNull();
  });
});
