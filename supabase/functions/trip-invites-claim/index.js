import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { log } from '../_shared/log.js';
import { getAdminClient } from '../_shared/supabaseAdmin.js';
import { createInviteStore } from '../_shared/trips/inviteStore.js';
import { claimEmailInvites } from '../_shared/trips/invites.js';

// POST /functions/v1/trip-invites-claim (docs/api.md)
//   {} -> { added: [{ tripId, title, ownerName }] }
// Appelée par l'application à l'ouverture (utilisateur connecté) : rattache
// les invitations e-mail de l'adresse vérifiée du compte (compte existant ou
// créé depuis l'invitation).
serveFunction({
  name: 'trip-invites-claim',
  methods: ['POST'],
  rateLimitKind: 'invites',
  handle: async ({ caller }) => {
    if (caller.type !== 'user') throw new AppError(401, 'unauthorized', 'A signed-in user is required');
    const db = getAdminClient();
    const { data, error } = await db.auth.admin.getUserById(caller.userId);
    if (error) {
      log('error', 'trip_invites_claim_user_failed', { code: error.code ?? error.status ?? null });
      throw new AppError(500, 'internal_error', 'Invitation check failed');
    }
    // Adresse confirmée seulement (connexion par code : toujours confirmée).
    const email = data.user?.email_confirmed_at ? data.user.email : null;
    return claimEmailInvites({ store: createInviteStore(db), userId: caller.userId, email });
  }
});
