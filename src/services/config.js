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
 * @property {{ source: string, dataDate: string | null, countries: Record<string, string> | null } | null} osm source des lieux OSM, date de la version en service et des données de chaque pays importé (écran À propos, /debug)
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
    osm: null,
    fetchedAt: null,
    updateRequired: error?.code === 'app_outdated',
    error
  };
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Source des lieux OSM reçue du serveur ; dataDate "YYYY-MM-DD" ou null ;
 * countries : { code pays: "YYYY-MM-DD" } (entrées invalides ignorées), ou
 * null (serveur plus ancien, manifeste illisible).
 */
function readOsm(osm) {
  if (!osm || typeof osm.source !== 'string') return null;
  const valid = Object.entries(osm.countries && typeof osm.countries === 'object' ? osm.countries : {}).filter(
    ([code, date]) => /^[A-Z]{2}$/.test(code) && DAY.test(date ?? '')
  );
  return {
    source: osm.source,
    dataDate: DAY.test(osm.dataDate ?? '') ? osm.dataDate : null,
    countries: valid.length ? Object.fromEntries(valid) : null
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
    osm: readOsm(data?.osm),
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
