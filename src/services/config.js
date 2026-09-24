import { RULES } from '@domain/config/rules.js';
import { flattenRules, mergeRules } from '@domain/config/mergeRules.js';
import { compareVersions, isValidVersion } from '@domain/version.js';
import { APP_VERSION } from '../config/app.js';
import { callFunction } from './api.js';
import { setRules } from './rules.js';

/**
 * @typedef {object} AppConfig
 * @property {'server' | 'saved' | 'defaults'} source d'où viennent les règles
 * @property {number | null} apiVersion version du contrat annoncée par le serveur
 * @property {string | null} minAppVersion
 * @property {typeof RULES} rules règles effectives
 * @property {string | null} contact contact de l'équipe (écran Confidentialité)
 * @property {string | null} fetchedAt date de réception par le serveur (ISO)
 * @property {boolean} updateRequired l'application est trop ancienne
 * @property {import('./api.js').ApiError} [error] raison du repli éventuel
 */

/** @returns {AppConfig} */
export function defaultConfig(error) {
  return {
    source: 'defaults',
    apiVersion: null,
    minAppVersion: null,
    rules: RULES,
    contact: null,
    fetchedAt: null,
    updateRequired: error?.code === 'app_outdated',
    error
  };
}

function fromServer(data, source, fetchedAt, error) {
  // Les règles reçues sont réappliquées sur les valeurs embarquées : une clé
  // inconnue ou d'un mauvais type est ignorée, une clé absente garde sa valeur.
  const { rules } = mergeRules(RULES, flattenRules(data?.rules ?? {}));
  const minAppVersion = isValidVersion(data?.minAppVersion) ? data.minAppVersion : null;
  const tooOld = minAppVersion !== null && compareVersions(APP_VERSION, minAppVersion) < 0;
  return {
    source,
    apiVersion: Number.isInteger(data?.apiVersion) ? data.apiVersion : null,
    minAppVersion,
    rules,
    contact: typeof data?.contact === 'string' && data.contact ? data.contact : null,
    fetchedAt,
    updateRequired: tooOld || error?.code === 'app_outdated',
    error
  };
}

/**
 * Récupère la configuration du serveur et la conserve localement. Si le
 * serveur ne répond pas : dernière configuration conservée, sinon valeurs
 * par défaut embarquées. Les règles obtenues deviennent les règles courantes.
 *
 * @param {{ fallback?: boolean }} [options] fallback: false pour obtenir l'erreur au lieu du repli
 * @returns {Promise<AppConfig>}
 * @throws {import('./api.js').ApiError} seulement si fallback est false
 */
export async function loadConfig({ fallback = true } = {}) {
  let config;
  try {
    const result = await callFunction('config', { method: 'GET', cacheKey: fallback ? 'config' : undefined });
    config = fromServer(result.data, result.fromCache ? 'saved' : 'server', result.savedAt, result.error);
  } catch (error) {
    if (!fallback) throw error;
    config = defaultConfig(error);
  }
  setRules(config.rules);
  return config;
}
