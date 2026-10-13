import { decodeJwtPayload } from '../_shared/auth.js';
import { AppError } from '../_shared/errors.js';
import { log } from '../_shared/log.js';
import { pushMessage, SEND_WINDOW_MINUTES } from '../_shared/push/reminders.js';
import { sendWebPush } from '../_shared/push/webPush.js';
import { errorResponse, jsonResponse } from '../_shared/respond.js';
import { getAdminClient } from '../_shared/supabaseAdmin.js';

/**
 * Tâche planifiée (chaque minute, pg_cron + pg_net, voir la migration
 * 20261013100000) : envoie par Web Push les rappels dont l'heure est passée
 * depuis moins de 15 minutes, les marque envoyés, et supprime les
 * abonnements expirés ou révoqués (réponses 404 ou 410 du service de push).
 * Un échec passager laisse le rappel à envoyer : nouvel essai à l'exécution
 * suivante, tant qu'il a moins de 15 minutes de retard.
 *
 * Réservée au rôle service_role (jeton de la tâche planifiée). Secrets
 * Supabase requis : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY et VAPID_SUBJECT
 * ("mailto:…"). La clé privée n'existe nulle part ailleurs.
 */
const BATCH_SIZE = 200;
const PARALLEL = 20;

Deno.serve(async (req) => {
  const started = Date.now();
  let response;
  try {
    if (req.method !== 'POST') throw new AppError(405, 'method_not_allowed', 'Use POST', { Allow: 'POST' });
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '') ?? '';
    if (decodeJwtPayload(token)?.role !== 'service_role') throw new AppError(403, 'forbidden', 'service_role required');

    const vapid = { publicKey: Deno.env.get('VAPID_PUBLIC_KEY'), privateKey: Deno.env.get('VAPID_PRIVATE_KEY'), subject: Deno.env.get('VAPID_SUBJECT') };
    if (!vapid.publicKey || !vapid.privateKey || !vapid.subject) throw new AppError(500, 'not_configured', 'VAPID secrets missing');

    const db = getAdminClient();
    const { data: due, error } = await db.rpc('push_claim_due', { p_window: `${SEND_WINDOW_MINUTES} minutes`, p_limit: BATCH_SIZE });
    if (error) throw new AppError(500, 'internal_error', `push_claim_due: ${error.code ?? 'failed'}`);

    const summary = { due: due.length, sent: 0, retry: 0, expired: 0 };
    const retryIds = [];
    const goneDevices = new Set();
    for (let i = 0; i < due.length; i += PARALLEL) {
      const results = await Promise.all(
        due.slice(i, i + PARALLEL).map(async (row) => {
          try {
            // Le service de push garde le message pour un appareil éteint tant que le rappel reste utile.
            return await sendWebPush({ subscription: row, payload: pushMessage(row), vapid, ttlSeconds: SEND_WINDOW_MINUTES * 60 });
          } catch {
            // Abonnement illisible (clés invalides) : inutilisable, supprimé.
            return { status: 0, outcome: 'gone' };
          }
        })
      );
      results.forEach(({ outcome }, j) => {
        const row = due[i + j];
        if (outcome === 'sent') summary.sent += 1;
        else if (outcome === 'gone') goneDevices.add(row.device_id);
        else retryIds.push(row.id);
      });
    }

    if (retryIds.length) {
      summary.retry = retryIds.length;
      await db.from('scheduled_reminders').update({ sent_at: null }).in('id', retryIds);
    }
    if (goneDevices.size) {
      summary.expired = goneDevices.size;
      // Les rappels de l'appareil sont supprimés en cascade.
      await db.from('push_subscriptions').delete().in('device_id', [...goneDevices]);
    }

    if (summary.due) log('info', 'push_sent', summary);
    response = jsonResponse(summary);
  } catch (err) {
    log('error', 'push_send_failed', { message: String(err?.message ?? err) });
    response = errorResponse(err);
  }
  log(response.status >= 500 ? 'error' : 'info', 'request', { fn: 'push-send', status: response.status, durationMs: Date.now() - started });
  return response;
});
