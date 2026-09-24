import { AppError } from './errors.js';

/**
 * Décode la charge utile d'un JWT, sans vérifier la signature.
 * @param {string} token
 * @returns {Record<string, unknown> | null}
 */
export function decodeJwtPayload(token) {
  const part = token.split('.')[1];
  if (!part) return null;
  try {
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const json = new TextDecoder().decode(Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)));
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/**
 * Identifie l'appelant. Toutes les fonctions sont déployées avec
 * verify_jwt = true (config.toml) : la passerelle Supabase a déjà vérifié la
 * signature du jeton (clé publique "anon" en mode invité, jeton de session en
 * mode connecté) avant d'appeler le code ; on ne lit ici que ses champs.
 * À VÉRIFIER : avec les nouvelles clés "publishable" (sb_publishable_…), qui
 * ne sont pas des JWT, il faudra verify_jwt = false et une vérification ici.
 * @param {Request} req
 * @returns {{ type: 'user', userId: string } | { type: 'guest' }}
 */
export function getCaller(req) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const claims = token ? decodeJwtPayload(token) : null;
  if (claims?.role === 'authenticated' && typeof claims.sub === 'string') {
    return { type: 'user', userId: claims.sub };
  }
  if (claims?.role === 'anon') return { type: 'guest' };
  throw new AppError(401, 'unauthorized', 'Missing or invalid token');
}
