/**
 * Versions : contrat d'API (docs/api.md) et version de l'application.
 */

/** Version courante du contrat d'API. Incrémentée à chaque changement incompatible. */
export const API_VERSION = 1;

/**
 * Le serveur accepte la version courante du contrat et la précédente.
 * @param {number} version
 * @param {number} [current]
 * @returns {'ok' | 'outdated' | 'unsupported'} outdated : trop ancienne ;
 *   unsupported : illisible ou plus récente que le serveur.
 */
export function checkApiVersion(version, current = API_VERSION) {
  if (!Number.isInteger(version) || version < 1 || version > current) return 'unsupported';
  return version >= current - 1 ? 'ok' : 'outdated';
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * @param {string} value
 * @returns {boolean} true pour une version "majeur.mineur.correctif"
 */
export function isValidVersion(value) {
  return typeof value === 'string' && VERSION_RE.test(value);
}

/**
 * Compare deux versions "majeur.mineur.correctif".
 * @param {string} a
 * @param {string} b
 * @returns {number} négatif si a < b, 0 si égales, positif si a > b
 */
export function compareVersions(a, b) {
  const pa = a.match(VERSION_RE);
  const pb = b.match(VERSION_RE);
  if (!pa || !pb) throw new RangeError(`Version invalide : ${!pa ? a : b}`);
  for (let i = 1; i <= 3; i += 1) {
    const diff = Number(pa[i]) - Number(pb[i]);
    if (diff !== 0) return diff;
  }
  return 0;
}
