import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { getAdminClient } from '../_shared/supabaseAdmin.js';
import { createInviteStore } from '../_shared/trips/inviteStore.js';
import { inviteByEmail } from '../_shared/trips/invites.js';
import { readTripId } from '../_shared/trips/readInput.js';
import { readJsonBody } from '../_shared/validate.js';

// POST /functions/v1/trip-invite-email (docs/api.md)
//   { tripId, email } -> { status: "recorded" }
// Owner seulement. Invitation réservée à une adresse (valable 30 jours),
// rattachée au compte qui se connecte avec elle (trip-invites-claim). Aucun
// e-mail n'est envoyé. Réponse identique que l'adresse ait un compte ou non.
// 20 invitations par jour et par utilisateur.
serveFunction({
  name: 'trip-invite-email',
  methods: ['POST'],
  rateLimitKind: 'invites',
  handle: async ({ req, caller }) => {
    if (caller.type !== 'user') throw new AppError(401, 'unauthorized', 'A signed-in user is required');
    const body = await readJsonBody(req);
    return inviteByEmail({ store: createInviteStore(getAdminClient()), userId: caller.userId, tripId: readTripId(body), email: body.email });
  }
});
