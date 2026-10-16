/**
 * Identifiants stables et déterministes (UUID version 5, RFC 9562) des
 * journées et des étapes qui n'en ont pas. Le même calcul est fait par la
 * migration SQL 20261016100000_shared_trips.sql (uuid_generate_v5) : un
 * séjour migré sur l'appareil (migrations.js, version 2 -> 3) et le même
 * séjour migré sur le serveur reçoivent les mêmes identifiants, et une
 * migration refaite à chaque lecture redonne toujours les mêmes.
 */

/** Espace de noms des identifiants de Mon guide (valeur fixe, ne jamais la changer). */
export const ID_NAMESPACE = '6f1c9a52-3b7e-4d2a-9c58-0e4b7d1f2a63';

/** @param {string} tripId @param {string} date "YYYY-MM-DD" */
export const dayId = (tripId, date) => uuidV5(`day:${tripId}:${date}`);

/** Étape sans identifiant (données anciennes) : position dans sa journée. */
export const stepId = (tripId, date, index) => uuidV5(`step:${tripId}:${date}:${index}`);

/**
 * @param {string} name
 * @param {string} [namespace] UUID
 * @returns {string} UUID version 5, en minuscules
 */
export function uuidV5(name, namespace = ID_NAMESPACE) {
  const ns = namespace.replace(/-/g, '').match(/../g).map((h) => parseInt(h, 16));
  const bytes = sha1([...ns, ...new TextEncoder().encode(name)]).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * SHA-1 synchrone (migrate() est synchrone, crypto.subtle ne l'est pas).
 * Sert uniquement à fabriquer des identifiants, jamais à la sécurité.
 * @param {number[]} message octets
 * @returns {number[]} 20 octets
 */
function sha1(message) {
  const bitLength = message.length * 8;
  const bytes = [...message, 0x80];
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 7; i >= 0; i -= 1) bytes.push(i >= 4 ? 0 : (bitLength >>> (i * 8)) & 0xff);

  const h = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0];
  const w = new Array(80);
  const rotl = (x, n) => (x << n) | (x >>> (32 - n));
  for (let chunk = 0; chunk < bytes.length; chunk += 64) {
    for (let i = 0; i < 16; i += 1) {
      const j = chunk + i * 4;
      w[i] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let i = 16; i < 80; i += 1) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let [a, b, c, d, e] = h;
    for (let i = 0; i < 80; i += 1) {
      const [f, k] = i < 20 ? [(b & c) | (~b & d), 0x5a827999] : i < 40 ? [b ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc] : [b ^ c ^ d, 0xca62c1d6];
      const t = (rotl(a, 5) + f + e + k + w[i]) | 0;
      e = d;
      d = c;
      c = rotl(b, 30);
      b = a;
      a = t;
    }
    h[0] = (h[0] + a) | 0;
    h[1] = (h[1] + b) | 0;
    h[2] = (h[2] + c) | 0;
    h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0;
  }
  return h.flatMap((x) => [(x >>> 24) & 0xff, (x >>> 16) & 0xff, (x >>> 8) & 0xff, x & 0xff]);
}
