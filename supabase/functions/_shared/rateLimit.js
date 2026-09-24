import { AppError } from './errors.js';
import { log } from './log.js';
import { getAdminClient } from './supabaseAdmin.js';

let saltWarningLogged = false;

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Identifiant du client : id utilisateur s'il est connecté, sinon empreinte
 * salée de l'adresse IP (secret RATE_LIMIT_SALT). L'IP en clair n'est jamais
 * stockée ni journalisée.
 * À VÉRIFIER : en-tête portant l'IP du client derrière la passerelle Supabase.
 */
async function clientId(req, caller) {
  if (caller.type === 'user') return `u:${caller.userId}`;
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const salt = Deno.env.get('RATE_LIMIT_SALT') ?? '';
  if (!salt && !saltWarningLogged) {
    saltWarningLogged = true;
    log('warn', 'rate_limit_salt_missing');
  }
  return `ip:${(await sha256Hex(`${salt}:${ip}`)).slice(0, 32)}`;
}

/**
 * Compte la requête dans une fenêtre fixe et refuse au-delà de la limite.
 * En cas de panne de la base, la requête passe (journalisé).
 * @param {{ req: Request, caller: { type: string, userId?: string }, kind: 'generate' | 'default', rules: any }} params
 * @throws {AppError} 429 avec l'en-tête Retry-After
 */
export async function enforceRateLimit({ req, caller, kind, rules }) {
  const { windowMin, generatePerWindow, otherPerWindow } = rules.rateLimits;
  const windowMs = windowMin * 60_000;
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const limit = kind === 'generate' ? generatePerWindow : otherPerWindow;
  const bucket = `${kind}:${await clientId(req, caller)}`;

  const { data: count, error } = await getAdminClient().rpc('rate_limit_hit', {
    p_bucket: bucket,
    p_window_start: new Date(windowStart).toISOString()
  });
  if (error) {
    log('error', 'rate_limit_failed', { code: error.code });
    return;
  }
  if (count > limit) {
    const retryAfterSec = Math.max(1, Math.ceil((windowStart + windowMs - Date.now()) / 1000));
    throw new AppError(429, 'rate_limited', 'Too many requests', { 'Retry-After': String(retryAfterSec) });
  }
}
