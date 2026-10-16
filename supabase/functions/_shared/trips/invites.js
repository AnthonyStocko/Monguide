import { AppError } from '../errors.js';

/**
 * Invitations aux séjours partagés (Prompt 8.0, Bloc C) : lien (jeton
 * aléatoire de 32 octets, seule son empreinte SHA-256 est en base), adresse
 * e-mail (rattachée au compte qui se connecte avec elle), rejoindre. Sans
 * accès direct à la base : `store` (inviteStore.js en production, une base en
 * mémoire dans les tests).
 */

export const LINK_DAYS = 7;
export const EMAIL_DAYS = 30;
export const EMAIL_INVITES_PER_DAY = 20;
export const MAX_MEMBERS = 10;

const DAY_MS = 24 * 3600 * 1000;

/** @param {Uint8Array} bytes */
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Jeton d'invitation : 32 octets aléatoires en base64url (43 caractères). */
export function generateToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

/** Forme d'un jeton (avant tout accès à la base). */
export const isTokenShape = (token) => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

/** Empreinte SHA-256 (hexadécimal) d'un jeton : seule valeur enregistrée. */
export async function hashToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Adresse e-mail normalisée (minuscules, espaces retirés), ou null si elle
 * n'a pas la forme d'une adresse.
 * @param {unknown} raw
 */
export function normalizeEmail(raw) {
  if (typeof raw !== 'string') return null;
  const email = raw.replace(/\s+/g, '').toLowerCase();
  return email.length >= 3 && email.length <= 254 && /^[^@]+@[^@]+\.[^@]+$/.test(email) ? email : null;
}

const notFound = () => new AppError(404, 'trip_not_found', 'Unknown trip');

async function requireOwner(store, tripId, userId) {
  const trip = await store.tripSummary(tripId);
  if (!trip || trip.deleted) throw notFound();
  const members = await store.members(tripId);
  const me = members.find((m) => m.user_id === userId);
  if (!me) throw notFound();
  if (me.role !== 'owner') throw new AppError(403, 'forbidden', 'Only the owner can invite');
  return { trip, members };
}

/**
 * Nouveau lien d'invitation (owner) : l'ancien lien actif est désactivé.
 * @returns {Promise<{ inviteId: string, url: string, expiresAt: string }>} url : seul moment où le jeton existe en clair
 */
export async function createLink({ store, userId, tripId, webUrl, now = Date.now() }) {
  if (!webUrl) throw new AppError(503, 'not_configured', 'web_url is not configured');
  await requireOwner(store, tripId, userId);
  await store.revokeActiveLinks(tripId);
  const token = generateToken();
  const expiresAt = new Date(now + LINK_DAYS * DAY_MS).toISOString();
  const invite = await store.insertInvite({ trip_id: tripId, kind: 'link', token_hash: await hashToken(token), created_by: userId, expires_at: expiresAt });
  return { inviteId: invite.id, url: `${webUrl}/rejoindre/${token}`, expiresAt };
}

/**
 * Invitation par adresse e-mail (owner). Réponse toujours identique, que
 * l'adresse ait un compte ou non : rien ne permet de savoir si elle est inscrite.
 * @returns {Promise<{ status: 'recorded' }>}
 */
export async function inviteByEmail({ store, userId, tripId, email, now = Date.now() }) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new AppError(400, 'invalid_input', 'email: invalid address');
  await requireOwner(store, tripId, userId);
  if ((await store.countEmailInvitesSince(userId, new Date(now - DAY_MS).toISOString())) >= EMAIL_INVITES_PER_DAY) {
    throw new AppError(429, 'invite_limit', `At most ${EMAIL_INVITES_PER_DAY} e-mail invitations per day`, { 'Retry-After': '3600' });
  }
  const expiresAt = new Date(now + EMAIL_DAYS * DAY_MS).toISOString();
  const pending = await store.pendingEmailInvite(tripId, normalized);
  if (pending) await store.updateInvite(pending.id, { expires_at: expiresAt });
  else await store.insertInvite({ trip_id: tripId, kind: 'email', email_normalized: normalized, created_by: userId, expires_at: expiresAt });
  return { status: 'recorded' };
}

/**
 * Lien d'invitation valide, sinon erreur explicite (lien inconnu, désactivé,
 * expiré). Un jeton modifié d'un seul caractère a une autre empreinte : inconnu.
 */
async function validLink(store, token, now) {
  if (!isTokenShape(token)) throw new AppError(404, 'invite_invalid', 'Unknown invitation link');
  const invite = await store.findLinkInvite(await hashToken(token));
  if (!invite) throw new AppError(404, 'invite_invalid', 'Unknown invitation link');
  if (invite.revoked_at) throw new AppError(410, 'invite_revoked', 'Invitation link disabled');
  if (Date.parse(invite.expires_at) <= now) throw new AppError(410, 'invite_expired', 'Invitation link expired');
  const trip = await store.tripSummary(invite.trip_id);
  if (!trip || trip.deleted) throw new AppError(404, 'invite_invalid', 'Unknown invitation link');
  return { invite, trip };
}

/**
 * Aperçu (preview) ou adhésion par lien. Aperçu : ville, dates, prénom de
 * l'owner, nombre de participants ; seulement pour un utilisateur connecté
 * porteur d'un jeton valide. Adhésion : editor ; sans effet s'il est déjà
 * participant ; séjour complet : erreur trip_full.
 */
export async function joinByLink({ store, userId, token, preview = false, now = Date.now() }) {
  const { invite, trip } = await validLink(store, token, now);
  const members = await store.members(trip.id);
  const alreadyMember = members.some((m) => m.user_id === userId);
  const full = !alreadyMember && members.length >= MAX_MEMBERS;
  if (preview) {
    const owner = members.find((m) => m.role === 'owner');
    return {
      tripId: trip.id,
      title: trip.title,
      destination: trip.destination?.name ?? null,
      startDate: trip.start_date,
      endDate: trip.end_date,
      ownerName: owner ? await store.displayName(owner.user_id) : null,
      memberCount: members.length,
      alreadyMember,
      full
    };
  }
  if (alreadyMember) return { tripId: trip.id, joined: false };
  if (full) throw tripFull();
  const added = await store.addEditor(trip.id, userId);
  if (added) await store.updateInvite(invite.id, { uses: (invite.uses ?? 0) + 1 });
  return { tripId: trip.id, joined: added };
}

const tripFull = () => new AppError(409, 'trip_full', `A trip has at most ${MAX_MEMBERS} participants`);

/**
 * Rattachement des invitations e-mail à l'ouverture de l'application :
 * l'utilisateur devient editor de chaque séjour où son adresse a été invitée
 * (compte existant ou créé depuis). Séjour complet : l'invitation reste en
 * attente.
 * @returns {Promise<{ added: { tripId: string, title: string, ownerName: string | null }[] }>}
 */
export async function claimEmailInvites({ store, userId, email, now = Date.now() }) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { added: [] };
  const added = [];
  for (const invite of await store.pendingInvitesFor(normalized)) {
    if (Date.parse(invite.expires_at) <= now) continue;
    const trip = await store.tripSummary(invite.trip_id);
    if (!trip || trip.deleted) continue;
    const members = await store.members(trip.id);
    if (!members.some((m) => m.user_id === userId)) {
      if (members.length >= MAX_MEMBERS) continue;
      let joined;
      try {
        joined = await store.addEditor(trip.id, userId);
      } catch (err) {
        if (err?.code === 'trip_full') continue;
        throw err;
      }
      if (joined) {
        const owner = members.find((m) => m.role === 'owner');
        added.push({ tripId: trip.id, title: trip.title, ownerName: owner ? await store.displayName(owner.user_id) : null });
      }
    }
    await store.updateInvite(invite.id, { accepted_at: new Date(now).toISOString(), accepted_by: userId });
  }
  return { added };
}
