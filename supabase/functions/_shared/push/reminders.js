import { AppError } from '../errors.js';

// Rappels de la version web : validation des demandes et réconciliation de la
// liste d'un séjour (fonctions pures, voir push-subscribe et push-schedule).

const invalid = (field, message) => new AppError(400, 'invalid_request', `${field}: ${message}`);

/** Rappels acceptés par appel (un séjour) ; un long séjour en compte une centaine. */
export const MAX_REMINDERS = 200;
/** Un rappel en retard de plus de 15 minutes n'est plus envoyé. */
export const SEND_WINDOW_MINUTES = 15;

/**
 * Services de push des navigateurs pris en charge. Le serveur n'envoie de
 * requête qu'à ces hôtes : une adresse quelconque fournie par un client
 * n'est jamais appelée.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge (Android, ordinateur)
  /^(.+\.)?push\.services\.mozilla\.com$/, // Firefox
  /^(.+\.)?push\.apple\.com$/, // Safari (iPhone, iPad, Mac)
  /^(.+\.)?notify\.windows\.com$/ // Edge (Windows)
];

/** @param {string} endpoint */
export function isAllowedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => host.test(url.hostname));
  } catch {
    return false;
  }
}

/** Identifiant aléatoire de l'appareil (UUID ou équivalent). */
export function readDeviceId(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9-]{16,64}$/.test(value)) throw invalid('deviceId', '16 to 64 letters, digits or dashes required');
  return value;
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

/**
 * Abonnement push envoyé par le navigateur (PushSubscription.toJSON()).
 * @returns {{ endpoint: string, p256dh: string, auth: string }}
 */
export function readSubscription(value) {
  const endpoint = value?.endpoint;
  const p256dh = value?.keys?.p256dh;
  const auth = value?.keys?.auth;
  if (typeof endpoint !== 'string' || endpoint.length > 1000 || !isAllowedPushEndpoint(endpoint)) throw invalid('subscription.endpoint', 'unknown push service');
  // Clé publique P-256 non compressée (65 octets) et secret de 16 octets, en base64url.
  if (typeof p256dh !== 'string' || !BASE64URL.test(p256dh) || p256dh.length !== 87) throw invalid('subscription.keys.p256dh', 'invalid key');
  if (typeof auth !== 'string' || !BASE64URL.test(auth) || auth.length !== 22) throw invalid('subscription.keys.auth', 'invalid key');
  return { endpoint, p256dh, auth };
}

function readText(value, field, max) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw invalid(field, `text of 1 to ${max} characters required`);
  return value;
}

/**
 * Liste complète des rappels d'un séjour. Rien dans le passé : un rappel dont
 * l'heure est déjà passée est ignoré. Une clé en double : le dernier l'emporte.
 * @param {unknown} value
 * @param {number} now instant (ms)
 * @returns {{ key: number, sendAt: string, title: string, body: string, url: string }[]}
 */
export function readReminders(value, now) {
  if (!Array.isArray(value)) throw invalid('reminders', 'array required');
  if (value.length > MAX_REMINDERS) throw invalid('reminders', `at most ${MAX_REMINDERS} reminders`);
  const byKey = new Map();
  value.forEach((item, i) => {
    const field = `reminders[${i}]`;
    if (!Number.isInteger(item?.key) || item.key < 1 || item.key > 0x7fffffff) throw invalid(`${field}.key`, 'positive 31-bit integer required');
    const at = typeof item.sendAt === 'string' ? Date.parse(item.sendAt) : NaN;
    if (!Number.isFinite(at)) throw invalid(`${field}.sendAt`, 'ISO 8601 instant required');
    const title = readText(item.title, `${field}.title`, 150);
    const body = readText(item.body, `${field}.body`, 1000);
    // Lien profond vers le planning uniquement : jamais d'adresse externe.
    if (typeof item.url !== 'string' || !/^\/planning\/[^/?#\s]+(\?[^#\s]*)?$/.test(item.url) || item.url.length > 300) throw invalid(`${field}.url`, 'planning link required');
    if (at > now) byKey.set(item.key, { key: item.key, sendAt: new Date(at).toISOString(), title, body, url: item.url });
  });
  return [...byKey.values()];
}

/**
 * Réconciliation (même logique que reconcilePlan sur Android) : compare la
 * liste attendue aux lignes enregistrées pour ce séjour et cet appareil.
 * - rappel inchangé : rien à écrire (déjà envoyé, il n'est pas renvoyé) ;
 * - rappel nouveau ou modifié (heure, texte, lien) : écrit, à envoyer ;
 * - rappel enregistré, pas encore envoyé et absent de la liste : supprimé.
 * La clé étant unique par appareil, aucun doublon n'est possible.
 * @param {{ reminder_key: number, send_at: string, title: string, body: string, url: string, sent_at: string | null }[]} existing
 * @param {{ key: number, sendAt: string, title: string, body: string, url: string }[]} wanted
 * @returns {{ toWrite: typeof wanted, toDelete: number[] }}
 */
export function planReminderSync(existing, wanted) {
  const current = new Map(existing.map((row) => [row.reminder_key, row]));
  const keys = new Set(wanted.map((r) => r.key));
  const same = (row, r) => Date.parse(row.send_at) === Date.parse(r.sendAt) && row.title === r.title && row.body === r.body && row.url === r.url;
  return {
    toWrite: wanted.filter((r) => !current.has(r.key) || !same(current.get(r.key), r)),
    toDelete: existing.filter((row) => row.sent_at === null && !keys.has(row.reminder_key)).map((row) => row.reminder_key)
  };
}

/**
 * Message remis au service worker de l'application (scripts/web/push-sw.js).
 * @param {{ reminder_key: number, title: string, body: string, url: string }} row
 */
export function pushMessage(row) {
  return JSON.stringify({ title: row.title, body: row.body, url: row.url, tag: String(row.reminder_key) });
}
