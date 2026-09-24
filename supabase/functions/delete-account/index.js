import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { log } from '../_shared/log.js';
import { getAdminClient } from '../_shared/supabaseAdmin.js';

// POST /functions/v1/delete-account -> { deleted: true } (docs/api.md)
// Réservée à un utilisateur connecté : supprime son compte ; ses séjours
// (table trips) sont supprimés en cascade par la base. La clé de service
// n'existe que côté serveur (secret fourni par Supabase aux fonctions).
serveFunction({
  name: 'delete-account',
  methods: ['POST'],
  handle: async ({ caller }) => {
    if (caller.type !== 'user') throw new AppError(401, 'unauthorized', 'A signed-in user is required');
    const { error } = await getAdminClient().auth.admin.deleteUser(caller.userId);
    if (error) {
      log('error', 'delete_account_failed', { code: error.code ?? error.status });
      throw new AppError(500, 'internal_error', 'Account deletion failed');
    }
    log('info', 'account_deleted');
    return { deleted: true };
  }
});
