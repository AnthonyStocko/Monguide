import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { getAdminClient } from '../_shared/supabaseAdmin.js';
import { createInviteStore } from '../_shared/trips/inviteStore.js';
import { createLink } from '../_shared/trips/invites.js';
import { readTripId } from '../_shared/trips/readInput.js';
import { readJsonBody } from '../_shared/validate.js';

// POST /functions/v1/trip-invite-link (docs/api.md)
//   { tripId } -> { inviteId, url, expiresAt }
// Owner seulement. Nouveau lien d'invitation valable 7 jours (l'ancien lien
// actif est désactivé) ; adresse <web_url>/rejoindre/<jeton>, web_url lu dans
// app_config. Le jeton n'existe en clair que dans cette réponse.
serveFunction({
  name: 'trip-invite-link',
  methods: ['POST'],
  rateLimitKind: 'invites',
  handle: async ({ req, caller, appConfig }) => {
    if (caller.type !== 'user') throw new AppError(401, 'unauthorized', 'A signed-in user is required');
    const tripId = readTripId(await readJsonBody(req));
    return createLink({ store: createInviteStore(getAdminClient()), userId: caller.userId, tripId, webUrl: appConfig.webUrl });
  }
});
