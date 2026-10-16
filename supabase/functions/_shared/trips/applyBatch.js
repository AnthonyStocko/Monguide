import { checkDay } from '../domain/dayEdits.js';
import { migrate } from '../domain/migrations.js';
import { applyOps } from '../domain/ops/applyOps.js';
import { MAX_OPS_PER_CALL } from '../domain/ops/opTypes.js';
import { batchSummary } from '../domain/ops/summaries.js';
import { rowToTrip, tripToRow } from '../domain/tripRow.js';
import { AppError } from '../errors.js';

/**
 * Cœur de la fonction trip-apply-ops (docs/api.md), sans accès direct à la
 * base : `store` fournit les lectures et les écritures (store.js en
 * production, une base en mémoire dans les tests).
 *
 * Les opérations sont appliquées sur la DERNIÈRE version du séjour, même si
 * l'appareil partait d'une version plus ancienne (baseVersion, gardé pour le
 * journal). L'écriture (store.commit -> trip_commit) ne réussit que si la
 * version n'a pas changé depuis la lecture ; sinon tout est relu et
 * réappliqué, au plus maxAttempts fois. Une opération déjà appliquée (même
 * opId) est ignorée.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @typedef {object} TripStore
 * @property {(tripId: string) => Promise<object | null>} loadTrip ligne de trips
 * @property {(tripId: string, userId: string) => Promise<{ role: 'owner' | 'editor', memberCount: number } | null>} membership
 * @property {(opIds: string[]) => Promise<Set<string>>} appliedOpIds
 * @property {(args: { tripId: string, expectedVersion: number, row: object, author: string, opIds: string[], opType: string, summary: string | null, stepIds: string[], summaryCount: number }) => Promise<{ version: number, updatedAt: string } | null>} commit
 *   null : la version a changé entre-temps
 * @property {(args: { tripId: string, owner: string, row: object, opIds: string[], opType: string, summary: string | null }) => Promise<{ version: number, updatedAt: string } | null>} create
 *   null : le séjour existe déjà
 * @property {(tripId: string, author: string) => Promise<void>} [notifyOthers] notifications web des autres participants (après écriture)
 */

/**
 * Lit et vérifie le corps { tripId, baseVersion, ops }. La forme de chaque
 * opération est vérifiée à l'application (refus individuel INVALID).
 * @returns {{ tripId: string, baseVersion: number, ops: object[] }}
 */
export function readBatch(body) {
  const { tripId, baseVersion, ops } = body ?? {};
  if (typeof tripId !== 'string' || !UUID.test(tripId)) throw new AppError(400, 'invalid_input', 'tripId: uuid required');
  if (!Number.isInteger(baseVersion) || baseVersion < 0) throw new AppError(400, 'invalid_input', 'baseVersion: integer >= 0 required');
  if (!Array.isArray(ops) || ops.length === 0) throw new AppError(400, 'invalid_input', 'ops: non-empty array required');
  if (ops.length > MAX_OPS_PER_CALL) throw new AppError(400, 'invalid_input', `ops: at most ${MAX_OPS_PER_CALL} per call`);
  const ids = ops.map((o) => o?.opId);
  if (ids.some((id) => typeof id !== 'string' || !UUID.test(id))) throw new AppError(400, 'invalid_input', 'ops[].opId: uuid required');
  if (new Set(ids).size !== ids.length) throw new AppError(400, 'invalid_input', 'ops[].opId: duplicate');
  return { tripId: tripId.toLowerCase(), baseVersion, ops };
}

/** "setStepTime" -> "set_step_time" (contrainte de trip_changes.op_type). */
export const opTypeColumn = (type) => type.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/**
 * @param {{ store: TripStore, userId: string, tripId: string, ops: object[], rules: any, maxAttempts?: number }} input
 * @returns {Promise<{ version: number, trip: object, rejected: { opId: string | null, code: string }[], warnings: Record<string, object> }>}
 */
export async function applyBatch({ store, userId, tripId, ops, rules, maxAttempts = 5 }) {
  const opIds = ops.map((o) => o.opId);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const row = await store.loadTrip(tripId);
    const done = await store.appliedOpIds(opIds);
    const fresh = ops.filter((o) => !done.has(o.opId));

    if (!row) {
      // Séjour inconnu : seule une création (première opération du lot) est possible.
      if (fresh[0]?.type !== 'createTrip') throw notFound();
      if (fresh[0].params?.trip?.id?.toLowerCase?.() !== tripId) throw new AppError(400, 'invalid_input', 'createTrip: trip.id must equal tripId');
      const result = applyOps(null, fresh, { rules, role: 'owner', memberCount: 1 });
      if (!result.trip) throw new AppError(400, 'invalid_input', 'createTrip: invalid trip');
      const next = tripToRow(result.trip);
      const saved = await store.create({ tripId, owner: userId, row: next, opIds: result.applied, ...history(result, fresh) });
      if (!saved) continue;
      return response({ ...next, id: tripId, version: saved.version, updated_at: saved.updatedAt }, result, rules);
    }

    const member = await store.membership(tripId, userId);
    // Non-participant : même réponse qu'un séjour inexistant (rien n'est révélé).
    if (!member) throw notFound();
    const current = migrate(rowToTrip(row)).trip;
    if (!fresh.length) return { version: row.version, trip: rowToTrip(row), rejected: [], warnings: {} };

    const result = applyOps(current, fresh, { rules, role: member.role, memberCount: member.memberCount });
    if (!result.applied.length) return { version: row.version, trip: rowToTrip(row), rejected: result.rejected, warnings: {} };

    const next = tripToRow(result.trip);
    const saved = await store.commit({ tripId, expectedVersion: row.version, row: next, author: userId, opIds: result.applied, ...history(result, fresh) });
    if (!saved) continue;
    // Séjour partagé : « Paul a modifié votre séjour » pour les autres (version web, jamais bloquant).
    if (member.memberCount > 1 && result.summaries.length) await store.notifyOthers?.(tripId, userId).catch(() => {});
    return response({ ...row, ...next, version: saved.version, updated_at: saved.updatedAt }, result, rules);
  }
  throw new AppError(409, 'conflict', 'Trip changed too often during the update, retry');
}

const notFound = () => new AppError(404, 'trip_not_found', 'Unknown trip');

/**
 * Une ligne d'historique par lot : type de la première opération résumée,
 * résumés à la suite, leur nombre, et les étapes touchées (mise en évidence
 * chez les autres participants).
 */
function history(result, ops) {
  const first = result.summaries[0];
  const done = new Set(result.applied);
  const stepIds = [...new Set(ops.filter((o) => done.has(o.opId)).map((o) => o.params?.stepId ?? o.params?.step?.id).filter((id) => typeof id === 'string'))];
  return {
    opType: opTypeColumn(first?.type ?? 'update'),
    summary: batchSummary(result.summaries.map((s) => s.text)),
    stepIds: stepIds.slice(0, 100),
    summaryCount: Math.max(1, result.summaries.length)
  };
}

/** Réponse : nouvelle version, séjour, refus, et avertissements des journées recalculées (checkDay, sans blocage). */
function response(row, result, rules) {
  const trip = rowToTrip(row);
  const warnings = {};
  for (const day of trip.days) {
    if (!result.touched.includes(day.id)) continue;
    const found = checkDay(day, { mode: trip.mode, countryCode: trip.destination?.countryCode }, rules);
    if (Object.keys(found).length) warnings[day.id] = found;
  }
  return { version: row.version, trip, rejected: result.rejected, warnings };
}
