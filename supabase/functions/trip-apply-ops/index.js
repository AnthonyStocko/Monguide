import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { getAdminClient } from '../_shared/supabaseAdmin.js';
import { applyBatch, readBatch } from '../_shared/trips/applyBatch.js';
import { createTripStore } from '../_shared/trips/store.js';
import { readJsonBody } from '../_shared/validate.js';

// POST /functions/v1/trip-apply-ops (docs/api.md)
//   { tripId, baseVersion, ops: [{ opId, type, params }] } -> { version, trip, rejected: [{ opId, code }], warnings }
// Seul chemin d'écriture d'un séjour par l'application : les opérations
// (domain/ops) sont appliquées sur la dernière version, dans une transaction
// (trip_commit), version + 1, une ligne d'historique. Utilisateur connecté et
// participant du séjour uniquement ; 50 opérations par appel ; 120 appels
// par minute et par utilisateur.
serveFunction({
  name: 'trip-apply-ops',
  methods: ['POST'],
  rateLimitKind: 'tripOps',
  handle: async ({ req, caller, appConfig }) => {
    if (caller.type !== 'user') throw new AppError(401, 'unauthorized', 'A signed-in user is required');
    const { tripId, ops } = readBatch(await readJsonBody(req));
    return applyBatch({ store: createTripStore(getAdminClient()), userId: caller.userId, tripId, ops, rules: appConfig.rules });
  }
});
