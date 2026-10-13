// Envoi Web Push sans bibliothèque, avec l'API Web Crypto (disponible dans
// Deno comme dans Node) : chiffrement du message (RFC 8291, aes128gcm,
// RFC 8188) et identification du serveur par clés VAPID (RFC 8292).
// Vérifié dans webPush.test.js contre la bibliothèque de référence web-push.

const encoder = new TextEncoder();

/** @param {string} text base64url (ou base64) */
export function base64UrlToBytes(text) {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** @param {ArrayBuffer | Uint8Array} bytes */
export function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

/** Taille d'enregistrement annoncée (RFC 8188) ; le message tient en un seul enregistrement. */
const RECORD_SIZE = 4096;
/** Message en clair le plus long accepté (les services de push limitent le corps à 4096 octets). */
export const MAX_PAYLOAD_BYTES = 3000;

/**
 * Chiffre un message pour un abonnement (RFC 8291, encodage aes128gcm).
 * @param {{ payload: Uint8Array, p256dh: string, auth: string }} input clés de l'abonnement en base64url
 * @returns {Promise<Uint8Array>} corps de la requête envoyée au service de push
 */
export async function encryptPayload({ payload, p256dh, auth }) {
  if (payload.length > MAX_PAYLOAD_BYTES) throw new Error('push payload too large');
  const clientPublic = base64UrlToBytes(p256dh);
  const authSecret = base64UrlToBytes(auth);
  const clientKey = await crypto.subtle.importKey('raw', clientPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  // Paire de clés à usage unique pour ce message.
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(encoder.encode('WebPush: info\0'), clientPublic, localPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const contentKey = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12);

  const key = await crypto.subtle.importKey('raw', contentKey, 'AES-GCM', false, ['encrypt']);
  // 0x02 : délimiteur du dernier (et seul) enregistrement.
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, tagLength: 128 }, key, concat(payload, Uint8Array.of(2))));

  const recordSize = new Uint8Array(4);
  new DataView(recordSize.buffer).setUint32(0, RECORD_SIZE);
  return concat(salt, recordSize, Uint8Array.of(localPublic.length), localPublic, ciphertext);
}

/**
 * En-tête Authorization VAPID : jeton signé (ES256) valable 12 heures pour
 * le service de push de l'abonnement.
 * @param {{ endpoint: string, publicKey: string, privateKey: string, subject: string, now?: number }} input
 *   publicKey, privateKey : clés VAPID en base64url ; subject : "mailto:…" ou adresse https
 */
export async function vapidAuthorization({ endpoint, publicKey, privateKey, subject, now = Date.now() }) {
  const point = base64UrlToBytes(publicKey);
  const jwk = { kty: 'EC', crv: 'P-256', d: privateKey, x: bytesToBase64Url(point.slice(1, 33)), y: bytesToBase64Url(point.slice(33, 65)) };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const header = bytesToBase64Url(encoder.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = bytesToBase64Url(encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(`${header}.${claims}`));
  return `vapid t=${header}.${claims}.${bytesToBase64Url(signature)}, k=${publicKey}`;
}

/**
 * Envoie un message à un abonnement.
 * @param {{
 *   subscription: { endpoint: string, p256dh: string, auth: string },
 *   payload: string,
 *   vapid: { publicKey: string, privateKey: string, subject: string },
 *   ttlSeconds: number,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number
 * }} input ttlSeconds : durée pendant laquelle le service de push garde le message pour un appareil éteint
 * @returns {Promise<{ status: number, outcome: 'sent' | 'gone' | 'retry' }>}
 *   gone : abonnement expiré ou révoqué (404, 410), à supprimer ; retry : échec passager
 */
export async function sendWebPush({ subscription, payload, vapid, ttlSeconds, fetchImpl = fetch, timeoutMs = 10000 }) {
  const body = await encryptPayload({ payload: encoder.encode(payload), p256dh: subscription.p256dh, auth: subscription.auth });
  const authorization = await vapidAuthorization({ endpoint: subscription.endpoint, ...vapid });
  let status = 0;
  try {
    const res = await fetchImpl(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttlSeconds),
        Urgency: 'high'
      },
      body,
      signal: AbortSignal.timeout(timeoutMs)
    });
    status = res.status;
    await res.body?.cancel().catch(() => {});
  } catch {
    // Réseau ou délai dépassé : nouvel essai à la prochaine exécution.
  }
  if (status >= 200 && status < 300) return { status, outcome: 'sent' };
  return { status, outcome: status === 404 || status === 410 ? 'gone' : 'retry' };
}
