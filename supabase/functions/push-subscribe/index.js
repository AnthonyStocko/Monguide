import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { log } from '../_shared/log.js';
import { readDeviceId, readSubscription } from '../_shared/push/reminders.js';
import { getAdminClient } from '../_shared/supabaseAdmin.js';
import { readJsonBody, readString } from '../_shared/validate.js';

// POST /functions/v1/push-subscribe (docs/api.md)
//   { deviceId, subscription: { endpoint, keys: { p256dh, auth } }, lang } -> { subscribed: true }
//   { deviceId, subscription: null } -> { subscribed: false } (abonnement et rappels supprimés)
// Version web : enregistre ou met à jour l'abonnement Web Push de l'appareil.
// Mode invité accepté ; le compte connecté, s'il y en a un, est noté.
serveFunction({
  name: 'push-subscribe',
  methods: ['POST'],
  handle: async ({ req, caller }) => {
    const body = await readJsonBody(req);
    const deviceId = readDeviceId(body.deviceId);
    const db = getAdminClient();

    if (body.subscription === null) {
      const { error } = await db.from('push_subscriptions').delete().eq('device_id', deviceId);
      if (error) throw failure('push_unsubscribe_failed', error);
      return { subscribed: false };
    }

    const subscription = readSubscription(body.subscription);
    const lang = readString(body.lang ?? 'fr', 'lang', { min: 2, max: 10 });
    const { error } = await db.from('push_subscriptions').upsert(
      {
        device_id: deviceId,
        user_id: caller.type === 'user' ? caller.userId : null,
        ...subscription,
        lang,
        last_seen_at: new Date().toISOString()
      },
      { onConflict: 'device_id' }
    );
    if (error) throw failure('push_subscribe_failed', error);
    return { subscribed: true };
  }
});

function failure(event, error) {
  log('error', event, { code: error.code ?? null });
  return new AppError(500, 'internal_error', 'Push subscription failed');
}
