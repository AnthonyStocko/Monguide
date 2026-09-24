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
