import { AppError } from '../errors.js';
import { log } from '../log.js';

/**
 * Accès à la base des fonctions d'invitation (interface attendue par
 * invites.js), avec la clé service_role : les droits sont vérifiés par
 * invites.js ; l'ajout d'un participant passe par trip_add_editor
 * (migration 20261016140000_trip_join.sql).
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 */
export function createInviteStore(db) {
  const run = async (step, query) => {
    const { data, error } = await query;
    if (error) throw failure(step, error);
    return data;
  };
  return {
    tripSummary: (tripId) => run('trip', db.from('trips').select('id, user_id, title, destination, start_date, end_date, deleted, version').eq('id', tripId).maybeSingle()),
    members: async (tripId) => (await run('members', db.from('trip_members').select('user_id, role, joined_at').eq('trip_id', tripId))) ?? [],
    displayName: async (userId) => (await run('profile', db.from('profiles').select('display_name').eq('user_id', userId).maybeSingle()))?.display_name ?? null,
    revokeActiveLinks: (tripId) => run('revoke', db.from('trip_invites').update({ revoked_at: new Date().toISOString() }).eq('trip_id', tripId).eq('kind', 'link').is('revoked_at', null)),
    insertInvite: (row) => run('insert', db.from('trip_invites').insert(row).select('id').single()),
    updateInvite: (id, patch) => run('update', db.from('trip_invites').update(patch).eq('id', id)),
    findLinkInvite: (tokenHash) => run('find', db.from('trip_invites').select('id, trip_id, expires_at, revoked_at, uses').eq('kind', 'link').eq('token_hash', tokenHash).maybeSingle()),
    pendingEmailInvite: (tripId, email) =>
      run('pending', db.from('trip_invites').select('id').eq('trip_id', tripId).eq('kind', 'email').eq('email_normalized', email).is('revoked_at', null).is('accepted_at', null).limit(1).maybeSingle()),
    countEmailInvitesSince: async (userId, since) => {
      const { count, error } = await db.from('trip_invites').select('id', { count: 'exact', head: true }).eq('created_by', userId).eq('kind', 'email').gte('created_at', since);
      if (error) throw failure('count', error);
      return count ?? 0;
    },
    pendingInvitesFor: async (email) =>
      (await run('claim', db.from('trip_invites').select('id, trip_id, expires_at').eq('kind', 'email').eq('email_normalized', email).is('revoked_at', null).is('accepted_at', null))) ?? [],
    addEditor: async (tripId, userId) => {
      const { data, error } = await db.rpc('trip_add_editor', { p_trip_id: tripId, p_user_id: userId });
      if (error?.message?.includes('trip_full')) throw new AppError(409, 'trip_full', 'A trip has at most 10 participants');
      if (error?.message?.includes('trip_not_found')) throw new AppError(404, 'invite_invalid', 'Unknown invitation link');
      if (error) throw failure('add_editor', error);
      return data === true;
    }
  };
}

function failure(step, error) {
  log('error', 'trip_invites_db_failed', { step, code: error.code ?? null });
  return new AppError(500, 'internal_error', 'Invitation failed');
}
