import { cached } from './cache.js';
import { RULES } from './domain/config/rules.js';
import { mergeRules } from './domain/config/mergeRules.js';
import { isValidVersion } from './domain/version.js';
import { AppError } from './errors.js';
import { log } from './log.js';
import { readOsmPointer } from './services/osmSource.js';
import { getAdminClient } from './supabaseAdmin.js';

/** Clé réservée de app_config : version minimale de l'application ("x.y.z"). */
export const MIN_APP_VERSION_KEY = 'minAppVersion';
const DEFAULT_MIN_APP_VERSION = '0.0.0';

/**
 * Clé réservée de app_config : adresse de la version web (JSON "https://…",
 * sans barre finale), base des liens d'invitation (…/rejoindre/<jeton>).
 */
export const WEB_URL_KEY = 'web_url';

/**
 * Clé réservée de app_config : version de schéma des séjours (schemaVersion,
 * domain/model.js) qu'une application doit connaître pour modifier un séjour
 * partagé (entier ; absente : 1, aucune restriction).
 */
export const MIN_SHARED_SCHEMA_KEY = 'min_shared_schema_version';
const RESERVED_KEYS = [MIN_APP_VERSION_KEY, WEB_URL_KEY, MIN_SHARED_SCHEMA_KEY];

/** Entier de 1 à 1000, sinon null. */
export function readSchemaVersion(value) {
  return Number.isInteger(value) && value >= 1 && value <= 1000 ? value : null;
}

/** Adresse https valide, sans barre finale ; null sinon. */
export function readWebUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.pathname === '/' && !url.search && !url.hash ? url.origin : null;
  } catch {
    return null;
  }
}

/**
 * Configuration effective : règles par défaut de rules.js + surcharges de la
 * table app_config (clé = chemin pointé). Mise en cache 5 minutes
 * (RULES.cacheTtlSec.config) dans api_cache sous la clé "config" ; un
 * déclencheur SQL vide cette entrée dès que app_config change. Contient
 * aussi le pointeur des tuiles OSM en service (osmPointer), relu avec la
 * configuration : places connaît ainsi la date des données sans autre
 * lecture.
 * @returns {Promise<{ minAppVersion: string, webUrl: string | null, minSharedSchemaVersion: number, rules: typeof RULES, osmPointer: { dataDate: string, manifest: string } | null }>}
 */
export function loadAppConfig() {
  return cached('config', {}, RULES.cacheTtlSec.config, async () => {
    const { data, error } = await getAdminClient().from('app_config').select('key, value');
    if (error) {
      log('error', 'app_config_read_failed', { code: error.code });
      throw new AppError(500, 'internal_error', 'Configuration unavailable');
    }

    const overrides = Object.fromEntries(
      data.filter((row) => !RESERVED_KEYS.includes(row.key)).map((row) => [row.key, row.value])
    );
    const { rules, ignored } = mergeRules(RULES, overrides);
    if (ignored.length) log('warn', 'app_config_ignored', { keys: ignored });

    const minRow = data.find((row) => row.key === MIN_APP_VERSION_KEY);
    if (minRow && !isValidVersion(minRow.value)) log('warn', 'app_config_ignored', { keys: [MIN_APP_VERSION_KEY] });
    const minAppVersion = isValidVersion(minRow?.value) ? minRow.value : DEFAULT_MIN_APP_VERSION;

    const webRow = data.find((row) => row.key === WEB_URL_KEY);
    const webUrl = readWebUrl(webRow?.value);
    if (webRow && !webUrl) log('warn', 'app_config_ignored', { keys: [WEB_URL_KEY] });

    const schemaRow = data.find((row) => row.key === MIN_SHARED_SCHEMA_KEY);
    const minSharedSchemaVersion = readSchemaVersion(schemaRow?.value) ?? 1;
    if (schemaRow && !readSchemaVersion(schemaRow.value)) log('warn', 'app_config_ignored', { keys: [MIN_SHARED_SCHEMA_KEY] });

    return { minAppVersion, webUrl, minSharedSchemaVersion, rules, osmPointer: await readOsmPointer(rules) };
  });
}
