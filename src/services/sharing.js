import { AVATAR_COLORS, avatarColor } from '../config/avatarColors.js';
import { authApi, sharingRemote, tripsRemote } from './api.js';
import * as settings from './settings.js';
import { onSyncStatus, syncNow } from './sync.js';
import { allTripRecords, purgeTrip } from './tripsStore.js';

/**
 * Séjours partagés, côté écran : participants, invitations (lien, e-mail),
 * rejoindre, quitter, profil affiché, historique.
 *
 * Le jeton d'un lien n'existe en clair que dans la réponse de sa création :
 * l'appareil qui l'a créé garde l'adresse ("inviteLink:<tripId>") pour la
 * copier ou la partager ensuite ; ailleurs, il faut créer un nouveau lien.
 */

const COUNT_KEY = (tripId) => `memberCount:${tripId}`;
const LINK_KEY = (tripId) => `inviteLink:${tripId}`;
const MEMBERS_KEY = (tripId) => `members:${tripId}`;

/** Identifiant de l'utilisateur connecté, ou null. */
export async function currentUserId() {
  return (await authApi.getSession().catch(() => null))?.user?.id ?? null;
}

/**
 * Nombre de participants d'un séjour du compte : lu en ligne, sinon dernière
 * valeur connue (1 si jamais lue).
 * @param {string} tripId
 * @returns {Promise<number>}
 */
export async function memberCount(tripId) {
  try {
    const count = await tripsRemote.memberCount(tripId);
    await settings.set(COUNT_KEY(tripId), count).catch(() => {});
    return count;
  } catch {
    return (await settings.get(COUNT_KEY(tripId)).catch(() => null)) ?? 1;
  }
}

/** Historique d'un séjour (200 dernières modifications), en ligne seulement. */
export function tripChanges(tripId) {
  return tripsRemote.changes(tripId);
}

const byOwnerFirst = (a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0);

/** Participants (owner en premier) avec leur prénom ; met à jour ceux gardés hors ligne. */
export async function tripMembers(tripId) {
  const members = [...(await sharingRemote.members(tripId))].sort(byOwnerFirst);
  await storeMembers(tripId, members);
  return members;
}

// --- Participants gardés sur l'appareil (liste des séjours, en-tête, toasts) --

/**
 * @typedef {{ userId: string, name: string | null, color: string | null, role: 'owner' | 'editor' }} CachedMember
 */
const memberListeners = new Set();

async function storeMembers(tripId, members) {
  /** @type {CachedMember[]} */
  const compact = members.map((m) => ({ userId: m.user_id, name: m.profile?.display_name ?? null, color: m.profile?.avatar_color ?? null, role: m.role }));
  await settings.set(MEMBERS_KEY(tripId), compact).catch(() => {});
  await settings.set(COUNT_KEY(tripId), compact.length).catch(() => {});
  memberListeners.forEach((l) => l(tripId));
}

/** Participants connus d'un séjour (dernière lecture en ligne), ou null. @returns {Promise<CachedMember[] | null>} */
export async function cachedMembers(tripId) {
  return (await settings.get(MEMBERS_KEY(tripId)).catch(() => null)) ?? null;
}

/** Prévient quand les participants gardés d'un séjour changent. @returns {() => void} */
export function onMembersChanged(listener) {
  memberListeners.add(listener);
  return () => memberListeners.delete(listener);
}

let lastMembersRefresh = 0;
const MEMBERS_REFRESH_MS = 60_000;

/** Participants de tous les séjours du compte, relus après une synchronisation (au plus une fois par minute). */
export async function refreshMembersCache({ force = false } = {}) {
  if (!navigator.onLine || (!force && Date.now() - lastMembersRefresh < MEMBERS_REFRESH_MS)) return;
  lastMembersRefresh = Date.now();
  const ids = (await allTripRecords()).filter((t) => Number.isInteger(t.version) && !t.deleted).map((t) => t.id);
  if (!ids.length) return;
  const rows = await sharingRemote.membersOf(ids);
  for (const id of ids) await storeMembers(id, rows.filter((m) => m.trip_id === id).sort(byOwnerFirst));
}

// --- En direct ---------------------------------------------------------------

/**
 * Nombre de modifications faites par les autres depuis la dernière visite,
 * puis la version actuelle est notée comme vue.
 * @param {string} tripId
 * @param {number} version version affichée
 */
export async function changesSinceLastVisit(tripId, version) {
  const userId = await currentUserId();
  if (!userId || !navigator.onLine) return 0;
  const seen = await tripsRemote.lastSeen(tripId, userId);
  const count = Number.isInteger(seen) && seen < version ? await tripsRemote.changesSince(tripId, seen, userId) : 0;
  await tripsRemote.markSeen(tripId, userId, version).catch(() => {});
  return count;
}

/** Note une version comme vue (modification reçue pendant l'affichage). */
export async function markSeen(tripId, version) {
  const userId = await currentUserId();
  if (userId && navigator.onLine) await tripsRemote.markSeen(tripId, userId, version).catch(() => {});
}

/** Nouvelles lignes de l'historique d'un séjour, en direct. @returns {() => void} */
export function subscribeTripChanges(tripId, onChange) {
  return tripsRemote.subscribeChanges(tripId, onChange);
}

/**
 * Invitations du séjour (owner) : lien actif (adresse connue si créé sur cet
 * appareil) et invitations e-mail en attente.
 * @returns {Promise<{ link: { inviteId: string, expiresAt: string, url: string | null } | null, emails: { id: string, email: string, expiresAt: string }[] }>}
 */
export async function tripInvites(tripId, now = Date.now()) {
  const invites = await sharingRemote.invites(tripId);
  const active = (i) => !i.revoked_at && Date.parse(i.expires_at) > now;
  const link = invites.find((i) => i.kind === 'link' && active(i)) ?? null;
  const cached = await settings.get(LINK_KEY(tripId)).catch(() => null);
  return {
    link: link ? { inviteId: link.id, expiresAt: link.expires_at, url: cached?.inviteId === link.id ? cached.url : null } : null,
    emails: invites.filter((i) => i.kind === 'email' && active(i) && !i.accepted_at).map((i) => ({ id: i.id, email: i.email_normalized, expiresAt: i.expires_at }))
  };
}

/** Nouveau lien (l'ancien est désactivé), gardé sur l'appareil. */
export async function createInviteLink(tripId) {
  const link = await sharingRemote.createLink(tripId);
  await settings.set(LINK_KEY(tripId), link).catch(() => {});
  return link;
}

export async function revokeInvite(tripId, inviteId) {
  await sharingRemote.revokeInvite(inviteId);
  const cached = await settings.get(LINK_KEY(tripId)).catch(() => null);
  if (cached?.inviteId === inviteId) await settings.remove(LINK_KEY(tripId)).catch(() => {});
}

export const inviteByEmail = (tripId, email) => sharingRemote.inviteEmail(tripId, email);

export const previewJoin = (token) => sharingRemote.previewJoin(token);

/** Rejoint un séjour puis le récupère (synchronisation) : il est ensuite sur l'appareil. */
export async function joinTrip(token) {
  const result = await sharingRemote.join(token);
  await syncNow();
  return result;
}

/** Retire un participant (owner). */
export async function removeMember(tripId, userId) {
  await sharingRemote.removeMember(tripId, userId);
}

/** Quitte un séjour (editor) : retiré du compte puis effacé de l'appareil. */
export async function leaveTrip(tripId) {
  const userId = await currentUserId();
  if (!userId) return;
  await sharingRemote.removeMember(tripId, userId);
  await settings.remove(COUNT_KEY(tripId)).catch(() => {});
  await purgeTrip(tripId);
}

/** Prénom et couleur de l'utilisateur connecté (null : jamais renseignés). */
export async function myProfile() {
  const userId = await currentUserId();
  if (!userId) return null;
  const profile = await sharingRemote.myProfile(userId);
  return profile ? { displayName: profile.display_name, avatarColor: profile.avatar_color } : null;
}

/** Enregistre le prénom affiché (1 à 40 caractères) ; couleur gardée, sinon choisie d'après le compte. */
export async function saveMyProfile(displayName, color) {
  const userId = await currentUserId();
  if (!userId) return;
  const name = displayName.trim().replace(/\s+/g, ' ');
  const avatarColor = color && AVATAR_COLORS[color] ? color : Object.keys(AVATAR_COLORS).find((k) => AVATAR_COLORS[k] === avatarColorOf(userId));
  await sharingRemote.saveProfile(userId, { displayName: name, avatarColor });
}

const avatarColorOf = (userId) => avatarColor(null, userId);

// --- Invitations e-mail rattachées à l'ouverture ----------------------------

const noticeListeners = new Set();
let pendingNotices = [];

/**
 * Séjours auxquels l'utilisateur vient d'être ajouté par invitation e-mail
 * (« Anthony vous a ajouté au séjour « Lyon, 3 jours » »).
 * @param {(notices: { tripId: string, title: string, ownerName: string | null }[]) => void} listener
 * @returns {() => void}
 */
export function onJoinedNotices(listener) {
  noticeListeners.add(listener);
  listener(pendingNotices);
  return () => noticeListeners.delete(listener);
}

export function dismissJoinedNotice(tripId) {
  pendingNotices = pendingNotices.filter((n) => n.tripId !== tripId);
  noticeListeners.forEach((l) => l(pendingNotices));
}

async function claim() {
  if (!(await currentUserId()) || !navigator.onLine) return;
  try {
    const { added } = await sharingRemote.claimInvites();
    if (!added.length) return;
    pendingNotices = [...pendingNotices, ...added];
    noticeListeners.forEach((l) => l(pendingNotices));
    await syncNow();
  } catch {
    // Nouvel essai à la prochaine ouverture ou connexion.
  }
}

let claiming = false;

/**
 * Rattache les invitations e-mail au lancement et à chaque connexion, et
 * relit les participants après chaque synchronisation (appelé une fois).
 */
export function startInviteClaims() {
  if (claiming) return;
  claiming = true;
  onSyncStatus((status) => status === 'synced' && refreshMembersCache().catch(() => {}));
  // Hors du rappel d'onAuthStateChange : un appel Supabase à l'intérieur peut bloquer le client.
  authApi.onChange((session) => session && setTimeout(claim, 0));
  claim();
}
