import { AppError } from '../_shared/errors.js';
import { serveFunction } from '../_shared/handler.js';
import { log } from '../_shared/log.js';
import { planReminderSync, readDeviceId, readReminders } from '../_shared/push/reminders.js';
import { getAdminClient } from '../_shared/supabaseAdmin.js';
import { readJsonBody, readString } from '../_shared/validate.js';

// POST /functions/v1/push-schedule (docs/api.md)
//   { deviceId, tripId, reminders: [{ key, sendAt, title, body, url }] } -> { scheduled, written, removed }
// Version web : reçoit la liste COMPLÈTE des rappels d'un séjour pour cet
// appareil et remplace l'existant (liste vide : séjour supprimé ou rappels
// désactivés). Aucun doublon (clé stable), rien dans le passé.
serveFunction({
  name: 'push-schedule',
  methods: ['POST'],
  handle: async ({ req }) => {
    const body = await readJsonBody(req);
    const deviceId = readDeviceId(body.deviceId);
    const tripId = readString(body.tripId, 'tripId', { max: 100 });
    const wanted = readReminders(body.reminders, Date.now());
    const db = getAdminClient();

    const { data: device, error: deviceError } = await db.from('push_subscriptions').select('device_id').eq('device_id', deviceId).maybeSingle();
    if (deviceError) throw failure(deviceError);
    // Abonnement inconnu (expiré, purgé) : l'application se réabonne puis renvoie la liste.
    if (!device) throw new AppError(404, 'not_subscribed', 'Unknown device: subscribe first');

    const { data: existing, error: readError } = await db
      .from('scheduled_reminders')
      .select('reminder_key, send_at, title, body, url, sent_at')
      .eq('device_id', deviceId)
      .eq('trip_id', tripId);
    if (readError) throw failure(readError);

    const { toWrite, toDelete } = planReminderSync(existing ?? [], wanted);
    if (toDelete.length) {
      const { error } = await db.from('scheduled_reminders').delete().eq('device_id', deviceId).in('reminder_key', toDelete);
      if (error) throw failure(error);
    }
    if (toWrite.length) {
      const rows = toWrite.map((r) => ({ device_id: deviceId, trip_id: tripId, reminder_key: r.key, send_at: r.sendAt, title: r.title, body: r.body, url: r.url, sent_at: null }));
      const { error } = await db.from('scheduled_reminders').upsert(rows, { onConflict: 'device_id,reminder_key' });
      if (error) throw failure(error);
    }
    // Appareil actif : son abonnement n'est pas purgé (90 jours sans nouvelles).
    await db.from('push_subscriptions').update({ last_seen_at: new Date().toISOString() }).eq('device_id', deviceId);

    return { scheduled: wanted.length, written: toWrite.length, removed: toDelete.length };
  }
});

function failure(error) {
  log('error', 'push_schedule_failed', { code: error.code ?? null });
  return new AppError(500, 'internal_error', 'Reminder scheduling failed');
}
