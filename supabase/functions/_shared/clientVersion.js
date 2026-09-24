import { API_VERSION, checkApiVersion, compareVersions, isValidVersion } from './domain/version.js';
import { AppError } from './errors.js';

/**
 * Lit et vérifie les en-têtes x-monguide-api (version du contrat) et
 * x-monguide-app (version de l'application).
 * @param {Headers} headers
 * @returns {{ apiVersion: number, appVersion: string }}
 * @throws {AppError} 400 si illisibles ou contrat futur, 426 si contrat trop ancien
 */
export function readClientVersions(headers) {
  const rawApi = headers.get('x-monguide-api');
  const apiVersion = rawApi !== null && /^\d+$/.test(rawApi) ? Number(rawApi) : Number.NaN;
  const apiStatus = checkApiVersion(apiVersion, API_VERSION);
  if (apiStatus === 'outdated') throw new AppError(426, 'app_outdated', 'API contract version no longer supported');
  if (apiStatus === 'unsupported') throw new AppError(400, 'unsupported_api_version', 'Missing or unsupported x-monguide-api');

  const appVersion = headers.get('x-monguide-app');
  if (!isValidVersion(appVersion)) throw new AppError(400, 'invalid_app_version', 'Missing or invalid x-monguide-app');
  return { apiVersion, appVersion };
}

/**
 * @param {string} appVersion
 * @param {string} minAppVersion
 * @throws {AppError} 426 si l'application est plus ancienne que minAppVersion
 */
export function assertMinAppVersion(appVersion, minAppVersion) {
  if (compareVersions(appVersion, minAppVersion) < 0) {
    throw new AppError(426, 'app_outdated', `App version ${appVersion} is older than ${minAppVersion}`);
  }
}
