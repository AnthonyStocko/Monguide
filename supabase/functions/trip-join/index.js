import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { getAdminClient } from '../_shared/supabaseAdmin.js';
import { createInviteStore } from '../_shared/trips/inviteStore.js';
import { joinByLink } from '../_shared/trips/invites.js';
import { readJsonBody } from '../_shared/validate.js';

// POST /functions/v1/trip-join (docs/api.md)
//   { token, preview?: true } -> preview : { tripId, title, destination, startDate, endDate, ownerName, memberCount, alreadyMember, full }
//                              -> sinon   : { tripId, joined }
// Utilisateur connecté porteur d'un jeton valide. Erreurs : 404 invite_invalid,
// 410 invite_revoked, 410 invite_expired, 409 trip_full. Déjà participant : sans effet.
serveFunction({
  name: 'trip-join',
  methods: ['POST'],
  handle: async ({ req, caller }) => {
    if (caller.type !== 'user') throw new AppError(401, 'unauthorized', 'A signed-in user is required');
    const body = await readJsonBody(req);
    return joinByLink({ store: createInviteStore(getAdminClient()), userId: caller.userId, token: body.token, preview: body.preview === true });
  }
});
