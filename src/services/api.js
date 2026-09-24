import { FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { API_VERSION } from '@domain/version.js';
import { APP_VERSION } from '../config/app.js';
import { getRules } from './rules.js';
import * as storage from './storage.js';
import { supabase } from './supabase.js';

/**
 * SEUL point d'accès réseau de l'application (hors tuiles de la carte) :
 * appels aux Edge Functions (docs/api.md), délais, cache local IndexedDB et
 * erreurs traduisibles.
 */

// Clé de traduction du message à afficher, par code d'erreur.
const MESSAGE_KEYS = {
  offline: 'errors.offline',
  network: 'errors.network',
  timeout: 'errors.timeout',
  rate_limited: 'errors.rateLimited',
  app_outdated: 'errors.appOutdated',
  external_unavailable: 'errors.external',
  not_configured: 'errors.notConfigured',
  internal_error: 'errors.server',
  server: 'errors.server'
};

// Code déduit du statut HTTP quand le corps de la réponse est illisible.
const STATUS_CODES = { 426: 'app_outdated', 429: 'rate_limited', 502: 'external_unavailable' };

// Erreurs pour lesquelles une réponse enregistrée peut être resservie.
const FALLBACK_CODES = new Set(['offline', 'network', 'timeout', 'rate_limited', 'internal_error', 'server', 'external_unavailable']);

export class ApiError extends Error {
  /**
   * @param {string} code code du contrat (docs/api.md) ou code local (offline, network, timeout…)
   * @param {{ status?: number | null, retryAfterSec?: number | null }} [details]
   */
  constructor(code, { status = null, retryAfterSec = null } = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
    /** Clé i18n du message à afficher à l'utilisateur. */
    this.messageKey = MESSAGE_KEYS[code] ?? 'errors.unknown';
  }
}

const updateListeners = new Set();

/**
 * Prévient quand le serveur exige une version plus récente (426).
 * @param {() => void} listener
 * @returns {() => void} désabonnement
 */
export function onUpdateRequired(listener) {
  updateListeners.add(listener);
  return () => updateListeners.delete(listener);
}

async function toApiError(error) {
  if (error instanceof FunctionsHttpError) {
    const res = error.context;
    let code = null;
    try {
      code = (await res.json())?.error?.code ?? null;
    } catch {
      // Corps illisible : code déduit du statut.
    }
    const retryAfter = Number(res.headers.get('Retry-After'));
    return new ApiError(code ?? STATUS_CODES[res.status] ?? 'unknown', {
      status: res.status,
      retryAfterSec: Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null
    });
  }
  if (error instanceof FunctionsRelayError) return new ApiError('server');
  return new ApiError('network');
}

async function invoke(name, { method, body, timeoutMs }) {
  const controller = new AbortController();
  let timer;
  // Délai garanti par une course contre un minuteur : le signal seul ne suffit
  // pas toujours à interrompre l'appel (constaté : attente de plus de 30 s).
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ApiError('timeout'));
    }, timeoutMs);
  });
  try {
    const { data, error } = await Promise.race([
      supabase.functions.invoke(name, {
        method,
        body,
        headers: { 'x-monguide-api': String(API_VERSION), 'x-monguide-app': APP_VERSION },
        signal: controller.signal
      }),
      timeout
    ]);
    if (error) throw controller.signal.aborted ? new ApiError('timeout') : await toApiError(error);
    return data;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(controller.signal.aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Appelle une Edge Function.
 * Avec cacheKey, la réponse est enregistrée dans IndexedDB et resservie si le
 * réseau ou le serveur fait défaut : le résultat porte alors fromCache: true
 * et l'erreur rencontrée, pour que l'écran le signale.
 *
 * @param {string} name nom de la fonction (docs/api.md)
 * @param {{ method?: 'GET' | 'POST', body?: object, timeoutMs?: number, cacheKey?: string }} [options]
 * @returns {Promise<{ data: any, fromCache: boolean, savedAt: string, error?: ApiError }>}
 * @throws {ApiError}
 */
export async function callFunction(name, { method = 'POST', body, timeoutMs, cacheKey } = {}) {
  const rules = getRules();
  const storeKey = cacheKey ? `api:${cacheKey}` : null;
  try {
    if (!supabase) throw new ApiError('not_configured');
    if (!navigator.onLine) throw new ApiError('offline');
    const data = await invoke(name, {
      method,
      body,
      timeoutMs: timeoutMs ?? (name === 'generate' ? rules.api.generateTimeoutMs : rules.api.timeoutMs)
    });
    const savedAt = new Date().toISOString();
    if (storeKey) await storage.set(storeKey, { data, savedAt }).catch(() => {});
    return { data, fromCache: false, savedAt };
  } catch (err) {
    const error = err instanceof ApiError ? err : new ApiError('unknown');
    if (error.code === 'app_outdated') updateListeners.forEach((listener) => listener());
    if (storeKey && FALLBACK_CODES.has(error.code)) {
      const saved = await storage.get(storeKey).catch(() => null);
      if (saved) return { data: saved.data, fromCache: true, savedAt: saved.savedAt, error };
    }
    throw error;
  }
}

/** Délai garanti pour un appel au client Supabase (authentification, table trips). */
function withTimeout(promise, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new ApiError('timeout')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function ensureOnline() {
  if (!supabase) throw new ApiError('not_configured');
  if (!navigator.onLine) throw new ApiError('offline');
}

/** Erreurs d'authentification Supabase -> clés de traduction. */
const AUTH_MESSAGES = {
  otp_expired: 'auth.errors.codeInvalid',
  invalid_credentials: 'auth.errors.codeInvalid',
  over_email_send_rate_limit: 'auth.errors.tooManyEmails',
  over_request_rate_limit: 'auth.errors.tooManyEmails',
  email_address_not_authorized: 'auth.errors.emailNotAuthorized',
  email_address_invalid: 'auth.errors.emailInvalid',
  validation_failed: 'auth.errors.emailInvalid'
};

function authError(error) {
  const e = new ApiError(error?.code ?? 'auth', { status: error?.status ?? null });
  e.messageKey = AUTH_MESSAGES[error?.code] ?? (error?.status === 429 ? 'auth.errors.tooManyEmails' : error?.status ? 'auth.errors.generic' : 'errors.network');
  return e;
}

/**
 * Comptes : connexion par code à usage unique envoyé par e-mail (OTP
 * Supabase, sans lien magique). La session est conservée par le client
 * (services/supabase.js) ; les appels aux fonctions utilisent alors le jeton
 * de l'utilisateur, sinon la clé publique (mode invité).
 */
export const authApi = {
  async sendCode(email) {
    ensureOnline();
    const { error } = await withTimeout(supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }), getRules().api.timeoutMs);
    if (error) throw authError(error);
  },
  async verifyCode(email, token) {
    ensureOnline();
    const { data, error } = await withTimeout(supabase.auth.verifyOtp({ email, token, type: 'email' }), getRules().api.timeoutMs);
    if (error) throw authError(error);
    return data.session;
  },
  async signOut() {
    if (supabase) await supabase.auth.signOut({ scope: 'local' });
  },
  async getSession() {
    if (!supabase) return null;
    const { data } = await supabase.auth.getSession();
    return data.session;
  },
  /** @param {(session: object | null) => void} listener @returns {() => void} */
  onChange(listener) {
    if (!supabase) return () => {};
    const { data } = supabase.auth.onAuthStateChange((_event, session) => listener(session));
    return () => data.subscription.unsubscribe();
  }
};

/** Table trips (RLS : uniquement les séjours de l'utilisateur connecté). */
export const tripsRemote = {
  /** Lignes modifiées depuis `since` (ISO), de la plus ancienne à la plus récente. */
  async pullSince(since) {
    ensureOnline();
    let query = supabase.from('trips').select('*').order('updated_at', { ascending: true });
    if (since) query = query.gt('updated_at', since);
    const { data, error } = await withTimeout(query, getRules().api.timeoutMs);
    if (error) throw new ApiError('server', { status: error.code ? 500 : null });
    return data;
  },
  /** Envoie des lignes (création ou mise à jour). */
  async push(rows) {
    if (!rows.length) return;
    ensureOnline();
    const { error } = await withTimeout(supabase.from('trips').upsert(rows, { onConflict: 'id' }), getRules().api.timeoutMs);
    if (error) throw new ApiError('server');
  }
};

/** Suppression du compte et de tous ses séjours (fonction delete-account). */
export async function deleteAccount() {
  await callFunction('delete-account', { method: 'POST', body: {} });
}
