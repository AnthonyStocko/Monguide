import { AppError } from '../errors.js';
import { log } from '../log.js';

/**
 * Accès à la base de la fonction trip-apply-ops (interface TripStore de
 * applyBatch.js), avec la clé service_role : les droits sont vérifiés par
 * applyBatch (participant, rôle) et l'écriture passe par trip_commit /
 * trip_create (migration 20261016120000_trip_ops.sql).
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @returns {import('./applyBatch.js').TripStore}
 */
export function createTripStore(db) {
  return {
    async loadTrip(tripId) {
      const { data, error } = await db.from('trips').select('*').eq('id', tripId).maybeSingle();
      if (error) throw failure('load', error);
      return data;
    },

    async membership(tripId, userId) {
      const { data, error } = await db.from('trip_members').select('user_id, role').eq('trip_id', tripId);
      if (error) throw failure('membership', error);
      const mine = (data ?? []).find((m) => m.user_id === userId);
      return mine ? { role: mine.role, memberCount: data.length } : null;
    },

    async appliedOpIds(opIds) {
      const { data, error } = await db.from('trip_applied_ops').select('op_id').in('op_id', opIds);
      if (error) throw failure('applied_ops', error);
      return new Set((data ?? []).map((r) => r.op_id));
    },

    async commit({ tripId, expectedVersion, row, author, opIds, opType, summary, stepIds = [], summaryCount = 1 }) {
      const { data, error } = await db.rpc('trip_commit', {
        p_trip_id: tripId,
        p_expected_version: expectedVersion,
        p_trip: contentOf(row),
        p_author: author,
        p_op_ids: opIds,
        p_op_type: opType,
        p_summary: summary,
        p_step_ids: stepIds,
        p_summary_count: summaryCount
      });
      if (error) throw failure('commit', error);
      return saved(data);
    },

    async notifyOthers(tripId, author) {
      const { error } = await db.rpc('trip_queue_change_pushes', { p_trip_id: tripId, p_author: author });
      if (error) log('warn', 'trip_change_push_failed', { code: error.code ?? null });
    },

    async create({ tripId, owner, row, opIds, opType, summary }) {
      const { data, error } = await db.rpc('trip_create', {
        p_trip_id: tripId,
        p_owner: owner,
        p_trip: { ...contentOf(row), created_at: row.created_at },
        p_op_ids: opIds,
        p_op_type: opType,
        p_summary: summary
      });
      if (error) throw failure('create', error);
      return saved(data);
    }
  };
}

const contentOf = (row) => ({
  title: row.title,
  destination: row.destination,
  start_date: row.start_date,
  end_date: row.end_date,
  params: row.params,
  planning: row.planning,
  deleted: row.deleted
});

const saved = (data) => {
  const first = Array.isArray(data) ? data[0] : null;
  return first ? { version: first.new_version, updatedAt: first.new_updated_at } : null;
};

function failure(step, error) {
  log('error', 'trip_ops_db_failed', { step, code: error.code ?? null });
  return new AppError(500, 'internal_error', 'Trip update failed');
}
