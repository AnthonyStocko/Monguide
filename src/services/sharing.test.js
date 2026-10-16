import { beforeEach, describe, expect, it, vi } from 'vitest';

const prefs = new Map();
vi.mock('./settings.js', () => ({
  get: async (k) => (prefs.has(k) ? prefs.get(k) : null),
  set: async (k, v) => void prefs.set(k, v),
  remove: async (k) => void prefs.delete(k)
}));
const remote = { invites: vi.fn(), createLink: vi.fn(), revokeInvite: vi.fn(), claimInvites: vi.fn(), removeMember: vi.fn() };
let onAuth = null;
vi.mock('./api.js', () => ({
  authApi: { getSession: async () => ({ user: { id: 'me' } }), onChange: (l) => ((onAuth = l), () => {}) },
  sharingRemote: remote,
  tripsRemote: { memberCount: vi.fn() }
}));
const syncNow = vi.fn(async () => {});
vi.mock('./sync.js', () => ({ syncNow: () => syncNow() }));
const purgeTrip = vi.fn(async () => {});
vi.mock('./tripsStore.js', () => ({ purgeTrip: (id) => purgeTrip(id) }));

const sharing = await import('./sharing.js');
const NOW = Date.parse('2026-10-16T12:00:00Z');

beforeEach(() => {
  prefs.clear();
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
});

describe('sharing', () => {
  it('lien actif : adresse connue seulement sur l’appareil qui l’a créé', async () => {
    remote.createLink.mockResolvedValue({ inviteId: 'i2', url: 'https://w/rejoindre/x', expiresAt: '2026-10-23T12:00:00Z' });
    await sharing.createInviteLink('t');
    remote.invites.mockResolvedValue([
      { id: 'i2', kind: 'link', expires_at: '2026-10-23T12:00:00Z', revoked_at: null },
      { id: 'i1', kind: 'link', expires_at: '2026-10-20T12:00:00Z', revoked_at: '2026-10-16T11:00:00Z' },
      { id: 'e1', kind: 'email', email_normalized: 'a@b.fr', expires_at: '2026-11-15T12:00:00Z', revoked_at: null, accepted_at: null },
      { id: 'e2', kind: 'email', email_normalized: 'c@d.fr', expires_at: '2026-11-15T12:00:00Z', revoked_at: null, accepted_at: '2026-10-16T10:00:00Z' }
    ]);
    expect(await sharing.tripInvites('t', NOW)).toEqual({
      link: { inviteId: 'i2', expiresAt: '2026-10-23T12:00:00Z', url: 'https://w/rejoindre/x' },
      emails: [{ id: 'e1', email: 'a@b.fr', expiresAt: '2026-11-15T12:00:00Z' }]
    });
    prefs.clear();
    expect((await sharing.tripInvites('t', NOW)).link.url).toBeNull();
  });

  it('lien désactivé : adresse oubliée sur l’appareil', async () => {
    prefs.set('inviteLink:t', { inviteId: 'i2', url: 'u' });
    await sharing.revokeInvite('t', 'i2');
    expect(remote.revokeInvite).toHaveBeenCalledWith('i2');
    expect(prefs.has('inviteLink:t')).toBe(false);
  });

  it('quitter : retiré du séjour puis effacé de l’appareil', async () => {
    await sharing.leaveTrip('t');
    expect(remote.removeMember).toHaveBeenCalledWith('t', 'me');
    expect(purgeTrip).toHaveBeenCalledWith('t');
  });

  it('invitations e-mail rattachées à l’ouverture : message puis synchronisation', async () => {
    remote.claimInvites.mockResolvedValue({ added: [{ tripId: 't', title: 'Lyon, 3 jours', ownerName: 'Anthony' }] });
    const seen = [];
    sharing.onJoinedNotices((n) => seen.push(n));
    sharing.startInviteClaims();
    await vi.waitFor(() => expect(syncNow).toHaveBeenCalled());
    expect(seen.at(-1)).toEqual([{ tripId: 't', title: 'Lyon, 3 jours', ownerName: 'Anthony' }]);
    sharing.dismissJoinedNotice('t');
    expect(seen.at(-1)).toEqual([]);
    expect(typeof onAuth).toBe('function');
  });
});
