/**
 * Fusion des règles par défaut avec des surcharges (table app_config côté
 * serveur, configuration reçue côté application).
 */

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Aplatit un arbre de règles en { "chemin.pointé": feuille }. Les tableaux
 * sont des feuilles.
 * @param {object} tree
 * @param {string} [prefix]
 * @returns {Record<string, unknown>}
 */
export function flattenRules(tree, prefix = '') {
  const out = {};
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value)) Object.assign(out, flattenRules(value, path));
    else out[path] = value;
  }
  return out;
}

function sameKind(a, b) {
  if (Array.isArray(a)) return Array.isArray(b) && b.every((item) => typeof item === typeof a[0]);
  if (typeof a === 'number') return typeof b === 'number' && Number.isFinite(b);
  return typeof a === typeof b;
}

/**
 * Applique des surcharges { "chemin.pointé": valeur } aux règles par défaut.
 * Une surcharge n'est retenue que si le chemin existe dans les défauts et que
 * la valeur est du même type ; les autres sont ignorées et listées.
 * @param {object} defaults
 * @param {Record<string, unknown>} overrides
 * @returns {{ rules: object, ignored: string[] }}
 */
export function mergeRules(defaults, overrides = {}) {
  const leaves = flattenRules(defaults);
  const rules = structuredClone(defaults);
  const ignored = [];

  for (const [path, value] of Object.entries(overrides)) {
    if (!(path in leaves) || !sameKind(leaves[path], value)) {
      ignored.push(path);
      continue;
    }
    const keys = path.split('.');
    const last = keys.pop();
    const parent = keys.reduce((node, key) => node[key], rules);
    parent[last] = structuredClone(value);
  }
  return { rules, ignored };
}
