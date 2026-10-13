import crypto from 'node:crypto';
import ece from 'http_ece';
import webpush from 'web-push';
import { describe, expect, it, vi } from 'vitest';
import { base64UrlToBytes, bytesToBase64Url, encryptPayload, MAX_PAYLOAD_BYTES, sendWebPush, vapidAuthorization } from './webPush.js';

// Vérification croisée avec la bibliothèque de référence web-push (et http_ece,
// qu'elle utilise) : ce que le serveur chiffre doit être lu par un navigateur.

/** Navigateur simulé : paire de clés et secret de l'abonnement. */
function browser() {
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const authSecret = crypto.randomBytes(16);
  return { ecdh, authSecret, p256dh: ecdh.getPublicKey().toString('base64url'), auth: authSecret.toString('base64url') };
}
const decrypt = (b, body) => ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: b.ecdh, authSecret: b.authSecret }).toString('utf8');

describe('base64url', () => {
  it('aller-retour, sans remplissage', () => {
    const bytes = Uint8Array.from([251, 255, 0, 62, 63]);
    expect(bytesToBase64Url(bytes)).toBe('-_8APj8');
    expect([...base64UrlToBytes('-_8APj8')]).toEqual([...bytes]);
  });
});

describe('encryptPayload (RFC 8291, aes128gcm)', () => {
  it('produit un message que le navigateur déchiffre', async () => {
    const b = browser();
    const text = JSON.stringify({ title: 'Dans une heure : Musée Paul-Dini', body: 'De 14:00 à 15:30 — Séjour à Villefranche', url: '/planning/t1?day=2026-10-20&step=s3' });
    const body = await encryptPayload({ payload: new TextEncoder().encode(text), p256dh: b.p256dh, auth: b.auth });
    expect(decrypt(b, body)).toBe(text);
  });

  it('en-tête : sel de 16 octets, taille d’enregistrement 4096, clé publique de 65 octets', async () => {
    const b = browser();
    const body = await encryptPayload({ payload: new TextEncoder().encode('x'), p256dh: b.p256dh, auth: b.auth });
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    expect(body[20]).toBe(65);
    expect(body[21]).toBe(4);
    // sel + taille + longueur + clé + (1 octet + délimiteur + étiquette de 16 octets)
    expect(body.length).toBe(16 + 4 + 1 + 65 + 18);
  });

  it('deux chiffrements du même message diffèrent (sel et clé à usage unique)', async () => {
    const b = browser();
    const payload = new TextEncoder().encode('même texte');
    const [one, two] = await Promise.all([encryptPayload({ payload, p256dh: b.p256dh, auth: b.auth }), encryptPayload({ payload, p256dh: b.p256dh, auth: b.auth })]);
    expect(Buffer.from(one).equals(Buffer.from(two))).toBe(false);
    expect(decrypt(b, one)).toBe(decrypt(b, two));
  });

  it('refuse un message trop long', async () => {
    const b = browser();
    await expect(encryptPayload({ payload: new Uint8Array(MAX_PAYLOAD_BYTES + 1), p256dh: b.p256dh, auth: b.auth })).rejects.toThrow('too large');
  });
});

describe('vapidAuthorization (RFC 8292)', () => {
  const keys = webpush.generateVAPIDKeys();
  const now = Date.UTC(2026, 9, 13, 8, 0, 0);

  it('jeton ES256 signé par la clé privée, vérifiable avec la clé publique', async () => {
    const header = await vapidAuthorization({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc', publicKey: keys.publicKey, privateKey: keys.privateKey, subject: 'mailto:contact@example.org', now });
    const [, token, key] = header.match(/^vapid t=([\w.-]+), k=([\w-]+)$/);
    expect(key).toBe(keys.publicKey);
    const [h, c, s] = token.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url'))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(Buffer.from(c, 'base64url'))).toEqual({ aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'mailto:contact@example.org' });

    const point = Buffer.from(keys.publicKey, 'base64url');
    const publicKey = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') } });
    expect(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(true);
  });

  it('une autre clé publique ne vérifie pas la signature', async () => {
    const other = webpush.generateVAPIDKeys();
    const header = await vapidAuthorization({ endpoint: 'https://web.push.apple.com/x', publicKey: keys.publicKey, privateKey: keys.privateKey, subject: 'mailto:a@b.c', now });
    const [h, c, s] = header.match(/t=([\w.-]+),/)[1].split('.');
    const point = Buffer.from(other.publicKey, 'base64url');
    const publicKey = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: point.subarray(1, 33).toString('base64url'), y: point.subarray(33).toString('base64url') } });
    expect(crypto.verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(false);
  });
});

describe('sendWebPush', () => {
  const vapid = { ...webpush.generateVAPIDKeys(), subject: 'mailto:contact@example.org' };
  const send = (status, b = browser()) => {
    const fetchImpl = vi.fn(async () => new Response(null, { status }));
    return { b, fetchImpl, result: sendWebPush({ subscription: { endpoint: 'https://updates.push.services.mozilla.com/wpush/v2/abc', p256dh: b.p256dh, auth: b.auth }, payload: '{"title":"Mon guide"}', vapid, ttlSeconds: 900, fetchImpl }) };
  };

  it('requête : POST chiffré, en-têtes aes128gcm, TTL et VAPID', async () => {
    const { b, fetchImpl, result } = send(201);
    await expect(result).resolves.toEqual({ status: 201, outcome: 'sent' });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://updates.push.services.mozilla.com/wpush/v2/abc');
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Encoding': 'aes128gcm', TTL: '900', Urgency: 'high' });
    expect(init.headers.Authorization).toMatch(/^vapid t=/);
    expect(decrypt(b, init.body)).toBe('{"title":"Mon guide"}');
  });

  it('abonnement expiré ou révoqué (404, 410) : à supprimer', async () => {
    await expect(send(410).result).resolves.toEqual({ status: 410, outcome: 'gone' });
    await expect(send(404).result).resolves.toEqual({ status: 404, outcome: 'gone' });
  });

  it('échec passager (429, 5xx, réseau) : à réessayer', async () => {
    await expect(send(429).result).resolves.toMatchObject({ outcome: 'retry' });
    await expect(send(503).result).resolves.toMatchObject({ outcome: 'retry' });
    const b = browser();
    const result = sendWebPush({ subscription: { endpoint: 'https://fcm.googleapis.com/x', p256dh: b.p256dh, auth: b.auth }, payload: 'x', vapid, ttlSeconds: 60, fetchImpl: async () => Promise.reject(new Error('network')) });
    await expect(result).resolves.toEqual({ status: 0, outcome: 'retry' });
  });
});
