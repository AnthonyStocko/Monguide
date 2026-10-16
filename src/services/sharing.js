import { AVATAR_COLORS, avatarColor } from '../config/avatarColors.js';
import { authApi, sharingRemote, tripsRemote } from './api.js';
import * as settings from './settings.js';
import { syncNow } from './sync.js';
import { purgeTrip } from './tripsStore.js';

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

/** Participants (owner en premier) avec leur prénom ; met à jour le nombre gardé hors ligne. */
export async function tripMembers(tripId) {
  const members = await sharingRemote.members(tripId);
  await settings.set(COUNT_KEY(tripId), members.length).catch(() => {});
  return [...members].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
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

/** Rattache les invitations e-mail au lancement et à chaque connexion (appelé une fois). */
export function startInviteClaims() {
  if (claiming) return;
  claiming = true;
  // Hors du rappel d'onAuthStateChange : un appel Supabase à l'intérieur peut bloquer le client.
  authApi.onChange((session) => session && setTimeout(claim, 0));
  claim();
}
