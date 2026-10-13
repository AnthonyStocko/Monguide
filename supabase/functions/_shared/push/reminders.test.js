import { describe, expect, it } from 'vitest';
import { isAllowedPushEndpoint, planReminderSync, pushMessage, readDeviceId, readReminders, readSubscription } from './reminders.js';

const now = Date.UTC(2026, 9, 13, 8, 0, 0);
const at = (minutes) => new Date(now + minutes * 60000).toISOString();
const reminder = (key, minutes, extra = {}) => ({ key, sendAt: at(minutes), title: 'Dans une heure : Musée', body: 'De 14:00 à 15:30', url: '/planning/t1?day=2026-10-13&step=s1', ...extra });
const row = (r, sentAt = null) => ({ reminder_key: r.key, send_at: r.sendAt, title: r.title, body: r.body, url: r.url, sent_at: sentAt });

describe('isAllowedPushEndpoint', () => {
  it('accepte les services de push des navigateurs', () => {
    for (const url of [
      'https://fcm.googleapis.com/fcm/send/abc',
      'https://updates.push.services.mozilla.com/wpush/v2/abc',
      'https://web.push.apple.com/abc',
      'https://wns2-par02p.notify.windows.com/w/?token=abc'
    ]) expect(isAllowedPushEndpoint(url)).toBe(true);
  });

  it('refuse toute autre adresse', () => {
    for (const url of ['http://fcm.googleapis.com/x', 'https://evil.example/fcm.googleapis.com', 'https://fcm.googleapis.com.evil.example/x', 'https://localhost/x', 'https://169.254.169.254/latest', 'pas une adresse']) {
      expect(isAllowedPushEndpoint(url)).toBe(false);
    }
  });
});

describe('readDeviceId et readSubscription', () => {
  const subscription = { endpoint: 'https://web.push.apple.com/abc', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };

  it('identifiant d’appareil : UUID accepté, valeur courte ou étrange refusée', () => {
    expect(readDeviceId('3f2b6c1e-8a4d-4f0b-9c2a-7d5e1f0a9b8c')).toBe('3f2b6c1e-8a4d-4f0b-9c2a-7d5e1f0a9b8c');
    for (const bad of ['court', 'x'.repeat(65), "abc'; drop table--xxxx", null]) expect(() => readDeviceId(bad)).toThrow();
  });

  it('abonnement valide', () => {
    expect(readSubscription(subscription)).toEqual({ endpoint: subscription.endpoint, p256dh: subscription.keys.p256dh, auth: subscription.keys.auth });
  });

  it('refuse un service inconnu ou des clés mal formées', () => {
    expect(() => readSubscription({ ...subscription, endpoint: 'https://evil.example/push' })).toThrow('unknown push service');
    expect(() => readSubscription({ ...subscription, keys: { ...subscription.keys, p256dh: 'trop-court' } })).toThrow();
    expect(() => readSubscription({ ...subscription, keys: { ...subscription.keys, auth: '+/'.repeat(11) } })).toThrow();
    expect(() => readSubscription(null)).toThrow();
  });
});

describe('readReminders', () => {
  it('garde les rappels à venir, normalise l’instant en UTC', () => {
    const list = readReminders([reminder(1, 60, { sendAt: '2026-10-13T11:00:00+02:00' })], now);
    expect(list).toEqual([{ ...reminder(1, 60), sendAt: '2026-10-13T09:00:00.000Z' }]);
  });

  it('rien dans le passé', () => {
    expect(readReminders([reminder(1, -1), reminder(2, 0), reminder(3, 5)], now).map((r) => r.key)).toEqual([3]);
  });

  it('aucun doublon : une clé répétée ne garde que le dernier rappel', () => {
    const list = readReminders([reminder(7, 30), reminder(7, 45)], now);
    expect(list).toEqual([reminder(7, 45)]);
  });

  it('refuse une liste trop longue, une clé, une heure ou un texte invalides', () => {
    expect(() => readReminders('x', now)).toThrow();
    expect(() => readReminders(Array.from({ length: 201 }, (_, i) => reminder(i + 1, 10)), now)).toThrow('at most 200');
    expect(() => readReminders([reminder(0, 10)], now)).toThrow();
    expect(() => readReminders([reminder(1.5, 10)], now)).toThrow();
    expect(() => readReminders([reminder(1, 10, { sendAt: 'demain' })], now)).toThrow();
    expect(() => readReminders([reminder(1, 10, { title: '' })], now)).toThrow();
    expect(() => readReminders([reminder(1, 10, { body: 'x'.repeat(1001) })], now)).toThrow();
  });

  it('n’accepte qu’un lien vers le planning', () => {
    for (const url of ['https://evil.example/', '//evil.example', '/account', '/planning/', 'javascript:alert(1)']) {
      expect(() => readReminders([reminder(1, 10, { url })], now)).toThrow('planning link');
    }
  });
});

describe('planReminderSync', () => {
  it('première programmation : tout est écrit', () => {
    const wanted = [reminder(1, 60), reminder(2, 120)];
    expect(planReminderSync([], wanted)).toEqual({ toWrite: wanted, toDelete: [] });
  });

  it('liste identique renvoyée : rien à écrire, rien à supprimer', () => {
    const wanted = [reminder(1, 60), reminder(2, 120)];
    expect(planReminderSync(wanted.map((r) => row(r)), wanted)).toEqual({ toWrite: [], toDelete: [] });
  });

  it('horaire modifié : le rappel est remplacé (même clé), sans doublon', () => {
    const before = reminder(1, 60);
    const after = reminder(1, 90);
    expect(planReminderSync([row(before)], [after])).toEqual({ toWrite: [after], toDelete: [] });
  });

  it('étape supprimée : son rappel non envoyé est supprimé', () => {
    expect(planReminderSync([row(reminder(1, 60)), row(reminder(2, 120))], [reminder(2, 120)])).toEqual({ toWrite: [], toDelete: [1] });
  });

  it('séjour supprimé (liste vide) : tous les rappels en attente sont supprimés, pas l’historique des envois', () => {
    const existing = [row(reminder(1, -30), at(-30)), row(reminder(2, 60)), row(reminder(3, 120))];
    expect(planReminderSync(existing, [])).toEqual({ toWrite: [], toDelete: [2, 3] });
  });

  it('rappel déjà envoyé et inchangé : jamais renvoyé ; déplacé plus tard : renvoyé', () => {
    const sent = reminder(1, 5);
    expect(planReminderSync([row(sent, at(-1))], [sent]).toWrite).toEqual([]);
    const moved = reminder(1, 45);
    expect(planReminderSync([row(sent, at(-1))], [moved]).toWrite).toEqual([moved]);
  });
});

describe('pushMessage', () => {
  it('titre, texte, lien et étiquette (une notification par rappel)', () => {
    expect(JSON.parse(pushMessage({ reminder_key: 42, title: 'T', body: 'B', url: '/planning/t1?day=2026-10-13' }))).toEqual({ title: 'T', body: 'B', url: '/planning/t1?day=2026-10-13', tag: '42' });
  });
});
