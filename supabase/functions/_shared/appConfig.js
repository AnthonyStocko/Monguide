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
 * Configuration effective : règles par défaut de rules.js + surcharges de la
 * table app_config (clé = chemin pointé). Mise en cache 5 minutes
 * (RULES.cacheTtlSec.config) dans api_cache sous la clé "config" ; un
 * déclencheur SQL vide cette entrée dès que app_config change. Contient
 * aussi le pointeur des tuiles OSM en service (osmPointer), relu avec la
 * configuration : places connaît ainsi la date des données sans autre
 * lecture.
 * @returns {Promise<{ minAppVersion: string, rules: typeof RULES, osmPointer: { dataDate: string, manifest: string } | null }>}
 */
export function loadAppConfig() {
  return cached('config', {}, RULES.cacheTtlSec.config, async () => {
    const { data, error } = await getAdminClient().from('app_config').select('key, value');
    if (error) {
      log('error', 'app_config_read_failed', { code: error.code });
      throw new AppError(500, 'internal_error', 'Configuration unavailable');
    }

    const overrides = Object.fromEntries(
      data.filter((row) => row.key !== MIN_APP_VERSION_KEY).map((row) => [row.key, row.value])
    );
    const { rules, ignored } = mergeRules(RULES, overrides);
    if (ignored.length) log('warn', 'app_config_ignored', { keys: ignored });

    const minRow = data.find((row) => row.key === MIN_APP_VERSION_KEY);
    if (minRow && !isValidVersion(minRow.value)) log('warn', 'app_config_ignored', { keys: [MIN_APP_VERSION_KEY] });
    const minAppVersion = isValidVersion(minRow?.value) ? minRow.value : DEFAULT_MIN_APP_VERSION;

    return { minAppVersion, rules, osmPointer: await readOsmPointer(rules) };
  });
}
