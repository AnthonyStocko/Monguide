import { describe, expect, it } from 'vitest';
import { claimEmailInvites, createLink, EMAIL_INVITES_PER_DAY, generateToken, hashToken, inviteByEmail, joinByLink, normalizeEmail } from './invites.js';

const TRIP = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-0000-4000-8000-00000000000a';
const EDITOR = 'aaaaaaaa-0000-4000-8000-00000000000b';
const GUEST = 'aaaaaaaa-0000-4000-8000-00000000000c';
const WEB = 'https://monguide.mgapp.workers.dev';

/** Base en mémoire : trips, trip_members, trip_invites, profiles (comme inviteStore.js). */
function memoryStore() {
  const db = {
    trips: new Map([[TRIP, { id: TRIP, user_id: OWNER, title: 'Lyon, 3 jours', destination: { name: 'Lyon' }, start_date: '2026-11-06', end_date: '2026-11-08', deleted: false, version: 4 }]]),
    members: [
      { trip_id: TRIP, user_id: OWNER, role: 'owner' },
      { trip_id: TRIP, user_id: EDITOR, role: 'editor' }
    ],
    invites: [],
    profiles: new Map([[OWNER, 'Anthony']]),
    changes: []
  };
  let n = 0;
  const store = {
    tripSummary: async (id) => db.trips.get(id) ?? null,
    members: async (id) => db.members.filter((m) => m.trip_id === id),
    displayName: async (id) => db.profiles.get(id) ?? null,
    revokeActiveLinks: async (id) => db.invites.filter((i) => i.trip_id === id && i.kind === 'link' && !i.revoked_at).forEach((i) => (i.revoked_at = new Date().toISOString())),
    insertInvite: async (row) => {
      const invite = { id: `inv-${(n += 1)}`, uses: 0, revoked_at: null, accepted_at: null, created_at: new Date().toISOString(), ...row };
      db.invites.push(invite);
      return { id: invite.id };
    },
    updateInvite: async (id, patch) => Object.assign(db.invites.find((i) => i.id === id), patch),
    findLinkInvite: async (hash) => db.invites.find((i) => i.kind === 'link' && i.token_hash === hash) ?? null,
    pendingEmailInvite: async (tripId, email) => db.invites.find((i) => i.trip_id === tripId && i.kind === 'email' && i.email_normalized === email && !i.revoked_at && !i.accepted_at) ?? null,
    countEmailInvitesSince: async (userId, since) => db.invites.filter((i) => i.kind === 'email' && i.created_by === userId && i.created_at >= since).length,
    pendingInvitesFor: async (email) => db.invites.filter((i) => i.kind === 'email' && i.email_normalized === email && !i.revoked_at && !i.accepted_at),
    addEditor: async (tripId, userId) => {
      if (db.members.some((m) => m.trip_id === tripId && m.user_id === userId)) return false;
      db.members.push({ trip_id: tripId, user_id: userId, role: 'editor' });
      db.changes.push({ trip_id: tripId, author_id: userId, summary: 'a rejoint le séjour' });
      return true;
    }
  };
  return { db, store };
}

const tokenOf = (url) => url.split('/rejoindre/')[1];
const addMembers = (db, count) => {
  for (let i = 0; i < count; i += 1) db.members.push({ trip_id: TRIP, user_id: `extra-${i}`, role: 'editor' });
};

describe('jetons', () => {
  it('32 octets aléatoires en base64url, jamais deux fois le même', () => {
    const a = generateToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(new Set(Array.from({ length: 50 }, generateToken)).size).toBe(50);
  });

  it('empreinte SHA-256 en hexadécimal', async () => {
    expect(await hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('createLink', () => {
  it('owner : lien <web_url>/rejoindre/<jeton>, 7 jours ; seule l’empreinte est en base', async () => {
    const { db, store } = memoryStore();
    const now = Date.parse('2026-10-16T12:00:00Z');
    const link = await createLink({ store, userId: OWNER, tripId: TRIP, webUrl: WEB, now });
    expect(link.url).toMatch(/^https:\/\/monguide\.mgapp\.workers\.dev\/rejoindre\/[A-Za-z0-9_-]{43}$/);
    expect(link.expiresAt).toBe('2026-10-23T12:00:00.000Z');
    const token = tokenOf(link.url);
    expect(db.invites).toHaveLength(1);
    expect(db.invites[0].token_hash).toBe(await hashToken(token));
    expect(JSON.stringify(db)).not.toContain(token);
  });

  it('un nouveau lien désactive l’ancien', async () => {
    const { db, store } = memoryStore();
    const first = await createLink({ store, userId: OWNER, tripId: TRIP, webUrl: WEB });
    await createLink({ store, userId: OWNER, tripId: TRIP, webUrl: WEB });
    expect(db.invites.map((i) => Boolean(i.revoked_at))).toEqual([true, false]);
    await expect(joinByLink({ store, userId: GUEST, token: tokenOf(first.url) })).rejects.toMatchObject({ code: 'invite_revoked' });
  });

  it('editor : refusé ; non-participant : séjour inconnu ; web_url absent : non configuré', async () => {
    const { store } = memoryStore();
    await expect(createLink({ store, userId: EDITOR, tripId: TRIP, webUrl: WEB })).rejects.toMatchObject({ status: 403, code: 'forbidden' });
    await expect(createLink({ store, userId: GUEST, tripId: TRIP, webUrl: WEB })).rejects.toMatchObject({ status: 404 });
    await expect(createLink({ store, userId: OWNER, tripId: TRIP, webUrl: null })).rejects.toMatchObject({ code: 'not_configured' });
  });
});

describe('joinByLink', () => {
  it('aperçu puis adhésion comme editor ; deuxième adhésion sans effet', async () => {
    const { db, store } = memoryStore();
    const { url } = await createLink({ store, userId: OWNER, tripId: TRIP, webUrl: WEB });
    const preview = await joinByLink({ store, userId: GUEST, token: tokenOf(url), preview: true });
    expect(preview).toEqual({ tripId: TRIP, title: 'Lyon, 3 jours', destination: 'Lyon', startDate: '2026-11-06', endDate: '2026-11-08', ownerName: 'Anthony', memberCount: 2, alreadyMember: false, full: false });
    expect(db.members).toHaveLength(2);
    expect(await joinByLink({ store, userId: GUEST, token: tokenOf(url) })).toEqual({ tripId: TRIP, joined: true });
    expect(db.members.find((m) => m.user_id === GUEST).role).toBe('editor');
    expect(db.invites[0].uses).toBe(1);
    expect(await joinByLink({ store, userId: GUEST, token: tokenOf(url) })).toEqual({ tripId: TRIP, joined: false });
    expect(db.members).toHaveLength(3);
  });

  it('un jeton modifié d’un seul caractère est refusé', async () => {
    const { store } = memoryStore();
    const token = tokenOf((await createLink({ store, userId: OWNER, tripId: TRIP, webUrl: WEB })).url);
    for (const i of [0, 20, 42]) {
      const altered = token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1);
      await expect(joinByLink({ store, userId: GUEST, token: altered })).rejects.toMatchObject({ status: 404, code: 'invite_invalid' });
      await expect(joinByLink({ store, userId: GUEST, token: altered, preview: true })).rejects.toMatchObject({ code: 'invite_invalid' });
    }
    await expect(joinByLink({ store, userId: GUEST, token: `${token}x` })).rejects.toMatchObject({ code: 'invite_invalid' });
  });

  it('lien expiré, désactivé, séjour complet : erreurs explicites', async () => {
    const { db, store } = memoryStore();
    const now = Date.parse('2026-10-16T12:00:00Z');
    const { url } = await createLink({ store, userId: OWNER, tripId: TRIP, webUrl: WEB, now });
    await expect(joinByLink({ store, userId: GUEST, token: tokenOf(url), now: now + 8 * 24 * 3600 * 1000 })).rejects.toMatchObject({ status: 410, code: 'invite_expired' });
    addMembers(db, 8);
    await expect(joinByLink({ store, userId: GUEST, token: tokenOf(url), now })).rejects.toMatchObject({ status: 409, code: 'trip_full' });
    expect((await joinByLink({ store, userId: GUEST, token: tokenOf(url), preview: true, now })).full).toBe(true);
    // Un participant déjà là passe toujours, même séjour complet.
    expect(await joinByLink({ store, userId: EDITOR, token: tokenOf(url), now })).toEqual({ tripId: TRIP, joined: false });
    db.invites[0].revoked_at = new Date(now).toISOString();
    await expect(joinByLink({ store, userId: GUEST, token: tokenOf(url), now })).rejects.toMatchObject({ status: 410, code: 'invite_revoked' });
  });

  it('séjour supprimé : lien inconnu', async () => {
    const { db, store } = memoryStore();
    const { url } = await createLink({ store, userId: OWNER, tripId: TRIP, webUrl: WEB });
    db.trips.get(TRIP).deleted = true;
    await expect(joinByLink({ store, userId: GUEST, token: tokenOf(url) })).rejects.toMatchObject({ code: 'invite_invalid' });
  });
});

describe('invitation par e-mail', () => {
  it('adresse normalisée (minuscules, espaces retirés) ; adresse invalide refusée', async () => {
    expect(normalizeEmail('  Paul.Martin @Exemple.FR ')).toBe('paul.martin@exemple.fr');
    expect(normalizeEmail('pas une adresse')).toBeNull();
    const { store } = memoryStore();
    await expect(inviteByEmail({ store, userId: OWNER, tripId: TRIP, email: 'x@' })).rejects.toMatchObject({ status: 400 });
  });

  it('réponse toujours identique ; une seule invitation en attente par adresse, prolongée à 30 jours', async () => {
    const { db, store } = memoryStore();
    const now = Date.parse('2026-10-16T12:00:00Z');
    expect(await inviteByEmail({ store, userId: OWNER, tripId: TRIP, email: 'Paul@Exemple.fr', now })).toEqual({ status: 'recorded' });
    expect(await inviteByEmail({ store, userId: OWNER, tripId: TRIP, email: 'paul@exemple.fr', now: now + 1000 })).toEqual({ status: 'recorded' });
    expect(db.invites).toHaveLength(1);
    expect(db.invites[0]).toMatchObject({ kind: 'email', email_normalized: 'paul@exemple.fr', expires_at: new Date(now + 1000 + 30 * 24 * 3600 * 1000).toISOString() });
  });

  it('owner seulement ; 20 invitations par jour et par utilisateur', async () => {
    const { store } = memoryStore();
    await expect(inviteByEmail({ store, userId: EDITOR, tripId: TRIP, email: 'a@b.fr' })).rejects.toMatchObject({ status: 403 });
    for (let i = 0; i < EMAIL_INVITES_PER_DAY; i += 1) await inviteByEmail({ store, userId: OWNER, tripId: TRIP, email: `p${i}@exemple.fr` });
    await expect(inviteByEmail({ store, userId: OWNER, tripId: TRIP, email: 'p99@exemple.fr' })).rejects.toMatchObject({ status: 429, code: 'invite_limit' });
  });

  it('adresse sans compte : rattachée automatiquement au compte créé ensuite avec cette adresse, une seule fois', async () => {
    const { db, store } = memoryStore();
    await inviteByEmail({ store, userId: OWNER, tripId: TRIP, email: 'nouveau@exemple.fr' });
    // Compte créé plus tard (adresse saisie autrement) : première ouverture de l'application.
    expect(await claimEmailInvites({ store, userId: GUEST, email: 'Nouveau@Exemple.fr' })).toEqual({ added: [{ tripId: TRIP, title: 'Lyon, 3 jours', ownerName: 'Anthony' }] });
    expect(db.members.find((m) => m.user_id === GUEST)?.role).toBe('editor');
    expect(db.invites[0].accepted_by).toBe(GUEST);
    // Il quitte le séjour : l'invitation déjà rattachée ne le rajoute pas.
    db.members = db.members.filter((m) => m.user_id !== GUEST);
    expect(await claimEmailInvites({ store, userId: GUEST, email: 'nouveau@exemple.fr' })).toEqual({ added: [] });
  });

  it('rattachement : invitation expirée ignorée ; séjour complet : reste en attente', async () => {
    const { db, store } = memoryStore();
    const now = Date.parse('2026-10-16T12:00:00Z');
    await inviteByEmail({ store, userId: OWNER, tripId: TRIP, email: 'plein@exemple.fr', now });
    addMembers(db, 8);
    expect(await claimEmailInvites({ store, userId: GUEST, email: 'plein@exemple.fr', now })).toEqual({ added: [] });
    expect(db.invites[0].accepted_at).toBeNull();
    db.members = db.members.filter((m) => !m.user_id.startsWith('extra-'));
    expect((await claimEmailInvites({ store, userId: GUEST, email: 'plein@exemple.fr', now: now + 31 * 24 * 3600 * 1000 })).added).toEqual([]);
    expect((await claimEmailInvites({ store, userId: GUEST, email: 'plein@exemple.fr', now })).added).toHaveLength(1);
  });
});
