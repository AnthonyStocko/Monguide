import { FORMAT_VERSION } from './build.js';

/**
 * Manifeste, contrôles avant publication et versions à conserver
 * (docs/osm-tiles.md).
 */

/**
 * @typedef {object} CountryResult
 * @property {string} path "<version>/<pays>/<cellDeg>"
 * @property {string} extract chemin Geofabrik
 * @property {string} extractDate horodatage de l'extrait (ISO)
 * @property {Record<string, number>} counts lieux par catégorie
 * @property {number} total
 * @property {string[]} tiles cases non vides
 * @property {number} files
 * @property {number} bytes
 * @property {number} maxFileBytes
 * @property {string | null} maxFile
 */

/** Version (dossier "YYYY-MM-DD") d'un chemin "<version>/<pays>/<cellDeg>". */
export const versionOf = (path) => path.split('/')[0];

export const isVersionName = (name) => /^\d{4}-\d{2}-\d{2}$/.test(name);

/**
 * Manifeste de la nouvelle version : pays générés par ce lancement, plus les
 * pays de la version en service non regénérés (lancement manuel d'un seul
 * pays), qui gardent leurs fichiers d'origine (champ path).
 * @param {{ version: string, cellDeg: number, results: Record<string, CountryResult>, previous: any }} input
 */
export function buildManifest({ version, cellDeg, results, previous }) {
  const countries = {};
  for (const [code, entry] of Object.entries(previous?.countries ?? {})) {
    if (results[code]) continue;
    if (previous.cellDeg !== cellDeg) {
      throw new Error(`le pas de grille change (${previous.cellDeg} -> ${cellDeg}) : il faut regénérer tous les pays, dont ${code}`);
    }
    countries[code] = entry;
  }
  for (const [code, r] of Object.entries(results)) {
    countries[code] = {
      path: r.path,
      extract: r.extract,
      extractDate: r.extractDate,
      total: r.total,
      counts: r.counts,
      files: r.files,
      bytes: r.bytes,
      tiles: r.tiles
    };
  }
  const sorted = Object.fromEntries(Object.keys(countries).sort().map((code) => [code, countries[code]]));
  return { v: FORMAT_VERSION, dataDate: version, cellDeg, countries: sorted };
}

/**
 * Contrôles avant publication. Renvoie la liste des erreurs (vide = publiable).
 * @param {{ results: Record<string, CountryResult>, previous: any, countries: { code: string, minRestaurants?: number }[], checks: { maxDropRatio: number, minCountForDropCheck: number, maxFileBytes: number } }} input
 * @returns {string[]}
 */
export function checkResults({ results, previous, countries, checks }) {
  const errors = [];
  const pct = (before, after) => `${Math.round(((before - after) / before) * 100)} %`;
  for (const [code, r] of Object.entries(results)) {
    const config = countries.find((c) => c.code === code);
    const minRestaurants = config?.minRestaurants;
    if (minRestaurants && (r.counts.restaurant ?? 0) < minRestaurants) {
      errors.push(`${code} : ${r.counts.restaurant ?? 0} restaurants, minimum attendu ${minRestaurants}.`);
    }
    if (r.maxFileBytes >= checks.maxFileBytes) {
      errors.push(`${code} : fichier de ${r.maxFileBytes} octets (${r.maxFile}), limite ${checks.maxFileBytes}.`);
    }
    const before = previous?.countries?.[code];
    if (!before) continue;
    const limit = 1 - checks.maxDropRatio;
    if (r.total < before.total * limit) {
      errors.push(`${code} : ${r.total} lieux contre ${before.total} dans la version en service (baisse de ${pct(before.total, r.total)}).`);
    }
    for (const [category, count] of Object.entries(before.counts ?? {})) {
      const now = r.counts[category] ?? 0;
      if (count >= checks.minCountForDropCheck && now < count * limit) {
        errors.push(`${code} : ${category} ${now} contre ${count} dans la version en service (baisse de ${pct(count, now)}).`);
      }
    }
  }
  return errors;
}

/**
 * Pointeur current.json de la nouvelle version. previous = version en
 * service juste avant (ou, si l'on regénère la même version, sa précédente),
 * pour un retour arrière.
 * @param {string} version
 * @param {{ dataDate: string, previous?: string | null } | null} current
 */
export function buildPointer(version, current) {
  const previous = !current ? null : current.dataDate !== version ? current.dataDate : (current.previous ?? null);
  return { dataDate: version, manifest: `${version}/manifest.json`, previous };
}

/**
 * Versions à conserver : la nouvelle, la précédente, et toutes celles dont
 * leurs manifestes utilisent des fichiers (pays non regénérés).
 * @param {{ pointer: { dataDate: string, previous: string | null }, manifest: any, previousManifest: any }} input
 * @returns {string[]}
 */
export function versionsToKeep({ pointer, manifest, previousManifest }) {
  const keep = new Set([pointer.dataDate]);
  if (pointer.previous) keep.add(pointer.previous);
  for (const m of [manifest, previousManifest]) {
    for (const entry of Object.values(m?.countries ?? {})) keep.add(versionOf(entry.path));
  }
  return [...keep].sort();
}

/**
 * Résumé Markdown (page du workflow).
 * @param {{ manifest: any, results: Record<string, CountryResult>, errors: string[], previous: any }} input
 */
export function summaryMarkdown({ manifest, results, errors, previous }) {
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} Mo`;
  const lines = [`## Tuiles de lieux OSM : version ${manifest.dataDate}`, ''];
  lines.push(errors.length ? '**Contrôles en échec : rien n’est publié.**' : 'Contrôles réussis.', '');
  for (const e of errors) lines.push(`- ❌ ${e}`);
  if (errors.length) lines.push('');
  for (const [code, r] of Object.entries(results)) {
    const before = previous?.countries?.[code];
    lines.push(`### ${code}`, '');
    lines.push(`- Données : extrait \`${r.extract}\` du ${r.extractDate}`);
    lines.push(`- Fichiers : ${r.files}, ${mb(r.bytes)} au total, le plus gros ${(r.maxFileBytes / 1024).toFixed(0)} Ko (\`${r.maxFile}\`)`);
    lines.push('', '| Catégorie | Lieux | Version en service |', '|---|---:|---:|');
    const categories = [...new Set([...Object.keys(r.counts), ...Object.keys(before?.counts ?? {})])].sort();
    for (const c of categories) lines.push(`| ${c} | ${r.counts[c] ?? 0} | ${before?.counts?.[c] ?? '—'} |`);
    lines.push(`| **total** | **${r.total}** | ${before?.total ?? '—'} |`, '');
  }
  return lines.join('\n');
}
