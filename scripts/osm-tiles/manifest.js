import { FORMAT_VERSION } from './build.js';

/**
 * Contrôles par pays, manifeste, plafond de stockage, dossiers à conserver
 * et résumé du lancement (docs/osm-tiles.md). Fonctions pures : cli.js lit
 * et écrit les fichiers.
 */

/**
 * @typedef {object} CountryResult Pays généré par ce lancement (cli.js build).
 * @property {string} path "<version>/<pays>/<cellDeg>"
 * @property {number} [format] version du format des tuiles (absent : 1)
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

/** Date des données d'une entrée de manifeste (les entrées v1 n'ont pas dataDate). */
export const entryDataDate = (entry) => entry.dataDate ?? entry.extractDate?.slice(0, 10) ?? versionOf(entry.path);

/**
 * Contrôles d'un pays avant publication. Renvoie ses erreurs (vide = publiable) :
 *  - fichier trop gros (limite par fichier du stockage) ;
 *  - premier import (aucune version précédente) : minimum de restaurants ;
 *  - sinon : baisse de plus de checks.maxDropRatio du total ou d'une
 *    catégorie d'au moins checks.minCountForDropCheck lieux.
 * @param {{ code: string, result: CountryResult, previous: any, minRestaurants?: number, checks: { maxDropRatio: number, minCountForDropCheck: number, maxFileBytes: number } }} input
 *   previous : entrée du pays dans le manifeste en service (ou absente)
 * @returns {string[]}
 */
export function checkCountry({ code, result, previous, minRestaurants, checks }) {
  const errors = [];
  const pct = (before, after) => `${Math.round(((before - after) / before) * 100)} %`;
  if (result.maxFileBytes >= checks.maxFileBytes) {
    errors.push(`${code} : fichier de ${result.maxFileBytes} octets (${result.maxFile}), limite ${checks.maxFileBytes}.`);
  }
  if (!previous) {
    const restaurants = result.counts.restaurant ?? 0;
    if (minRestaurants && restaurants < minRestaurants) errors.push(`${code} : ${restaurants} restaurants pour un premier import, minimum attendu ${minRestaurants}.`);
    return errors;
  }
  const limit = 1 - checks.maxDropRatio;
  if (result.total < previous.total * limit) {
    errors.push(`${code} : ${result.total} lieux contre ${previous.total} dans sa version précédente (baisse de ${pct(previous.total, result.total)}).`);
  }
  for (const [category, count] of Object.entries(previous.counts ?? {})) {
    const now = result.counts[category] ?? 0;
    if (count >= checks.minCountForDropCheck && now < count * limit) {
      errors.push(`${code} : ${category} ${now} contre ${count} dans sa version précédente (baisse de ${pct(count, now)}).`);
    }
  }
  return errors;
}

/**
 * Manifeste de la nouvelle version (v2) : pays générés et contrôlés par ce
 * lancement (results), plus tous les pays de la version en service qui ne
 * le sont pas (non demandés, ou en échec), avec leur entrée inchangée : ils
 * restent servis depuis leur dossier d'origine. Pour chaque pays : dossier
 * (path), date des données, lieux par catégorie, cases non vides, et
 * previousPath, dossier de sa version précédente (gardé pour un retour
 * arrière, voir storagePlan). Un pays de la version en service absent de
 * configured (retiré de countries.json) sort du manifeste : ses lieux ne
 * sont plus servis, ses fichiers sont supprimés au lancement suivant.
 * @param {{ version: string, cellDeg: number, results: Record<string, CountryResult>, previous: any, configured?: string[] }} input
 *   configured : codes des pays configurés (tous gardés si absent)
 */
export function buildManifest({ version, cellDeg, results, previous, configured }) {
  const countries = {};
  for (const [code, entry] of Object.entries(previous?.countries ?? {})) {
    if (results[code] || (configured && !configured.includes(code))) continue;
    if (previous.cellDeg !== cellDeg) {
      throw new Error(`le pas de grille change (${previous.cellDeg} -> ${cellDeg}) : il faut regénérer tous les pays, dont ${code}`);
    }
    countries[code] = entry;
  }
  for (const [code, r] of Object.entries(results)) {
    const before = previous?.countries?.[code];
    const previousPath = !before ? null : before.path !== r.path ? before.path : (before.previousPath ?? null);
    countries[code] = {
      path: r.path,
      format: r.format ?? FORMAT_VERSION,
      dataDate: r.extractDate.slice(0, 10),
      extract: r.extract,
      extractDate: r.extractDate,
      total: r.total,
      counts: r.counts,
      files: r.files,
      bytes: r.bytes,
      tiles: r.tiles,
      previousPath
    };
  }
  const sorted = Object.fromEntries(Object.keys(countries).sort().map((code) => [code, countries[code]]));
  return { v: FORMAT_VERSION, dataDate: version, cellDeg, countries: sorted };
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

/** Dossier de pays "<version>/<pays>/<cellDeg>" d'une clé de tuile, sinon null. */
function tileFolder(key) {
  const parts = key.split('/');
  return parts.length === 4 && isVersionName(parts[0]) && parts[3].endsWith('.json.gz') ? parts.slice(0, 3).join('/') : null;
}

/**
 * Espace occupé après publication et nettoyage, et ce qu'il faut supprimer.
 *
 * Conservés : current.json ; les manifestes de la nouvelle version et de la
 * précédente (pointer.previous, retour arrière) ; pour chaque pays du
 * nouveau manifeste, son dossier en service et celui de sa version
 * précédente (previousPath) ; tous les dossiers du manifeste précédent. Un
 * dossier plus ancien n'est supprimé que si aucun de ces manifestes ne le
 * référence. Les fichiers inconnus (hors "<version>/…") ne sont pas touchés.
 * Sans le manifeste précédent (keptPrevious undefined alors que
 * pointer.previous existe), rien n'est supprimé.
 *
 * @param {{
 *   objects: { Key: string, Size: number }[],
 *   newFiles: { Key: string, Size: number }[],
 *   manifest: any,
 *   pointer: { dataDate: string, previous: string | null },
 *   keptPrevious: any
 * }} input objects : contenu actuel du bucket ; newFiles : fichiers à publier
 * @returns {{ totalBytes: number, byCountry: { code: string, bytes: number }[], deletions: string[] }}
 *   deletions : dossiers ("…/", suppression récursive) et fichiers à supprimer
 */
export function storagePlan({ objects, newFiles, manifest, pointer, keptPrevious }) {
  const unknownPrevious = Boolean(pointer.previous) && keptPrevious === undefined;
  const keepFolders = new Set();
  for (const e of Object.values(manifest.countries)) {
    keepFolders.add(e.path);
    if (e.previousPath) keepFolders.add(e.previousPath);
  }
  for (const e of Object.values(keptPrevious?.countries ?? {})) keepFolders.add(e.path);
  const keepManifests = new Set([pointer.dataDate, pointer.previous].filter(Boolean).map((v) => `${v}/manifest.json`));

  const isKept = (key) => {
    if (unknownPrevious) return true;
    if (/^\d{4}-\d{2}-\d{2}\/manifest\.json$/.test(key)) return keepManifests.has(key);
    const folder = tileFolder(key);
    return folder ? keepFolders.has(folder) : true;
  };

  const files = new Map();
  const deletions = new Set();
  for (const { Key, Size } of objects) {
    if (isKept(Key)) files.set(Key, Size);
    else deletions.add(tileFolder(Key) ? `${tileFolder(Key)}/` : Key);
  }
  for (const { Key, Size } of newFiles) files.set(Key, Size);

  let totalBytes = 0;
  const perCountry = {};
  for (const [key, size] of files) {
    totalBytes += size;
    if (tileFolder(key)) {
      const code = key.split('/')[1];
      perCountry[code] = (perCountry[code] ?? 0) + size;
    }
  }
  const byCountry = Object.entries(perCountry)
    .map(([code, bytes]) => ({ code, bytes }))
    .sort((a, b) => b.bytes - a.bytes || (a.code < b.code ? -1 : 1));
  return { totalBytes, byCountry, deletions: [...deletions].sort() };
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} Mo`;

/**
 * Message du plafond de stockage dépassé, avec les pays les plus volumineux.
 * @param {{ totalBytes: number, byCountry: { code: string, bytes: number }[] }} plan
 * @param {number} maxBytes
 */
export function storageCeilingMessage(plan, maxBytes) {
  const top = plan.byCountry
    .slice(0, 5)
    .map((c) => `${c.code} ${mb(c.bytes)}`)
    .join(', ');
  return `Plafond de stockage dépassé : ${mb(plan.totalBytes)} après publication (versions conservées comprises), plafond ${mb(maxBytes)}. Pays les plus volumineux : ${top}. Rien n'est publié.`;
}

/**
 * Statut de chaque pays pour le résumé :
 *  - updated : généré, contrôlé et publié ;
 *  - failed_kept : en échec, sa version précédente reste en service ;
 *  - failed_missing : en échec, sans version précédente (pays non couvert) ;
 *  - kept : non demandé, sa version reste en service ;
 *  - not_published : généré et contrôlé, mais rien n'est publié (plafond) ;
 *  - removed : retiré de countries.json, absent du nouveau manifeste.
 * @param {{ manifest: any | null, previous: any, results: Record<string, CountryResult>, failures: Record<string, string[]> }} input
 *   manifest null : rien n'est publié (la version en service reste)
 * @returns {{ code: string, status: 'updated' | 'failed_kept' | 'failed_missing' | 'kept' | 'not_published' | 'removed', dataDate: string | null, total: number | null, bytes: number | null, files: number | null, errors: string[] }[]}
 */
export function countryStatuses({ manifest, previous, results, failures }) {
  const served = manifest ?? previous ?? { countries: {} };
  const removed = manifest ? Object.keys(previous?.countries ?? {}).filter((code) => !manifest.countries[code]) : [];
  const codes = [...new Set([...Object.keys(served.countries), ...Object.keys(results), ...Object.keys(failures), ...removed])].sort();
  return codes.map((code) => {
    if (removed.includes(code)) {
      const entry = previous.countries[code];
      return { code, status: 'removed', dataDate: entryDataDate(entry), total: entry.total ?? null, bytes: entry.bytes ?? null, files: entry.files ?? null, errors: [] };
    }
    const errors = failures[code] ?? [];
    const generated = results[code] && !errors.length;
    const status = errors.length ? (served.countries[code] ? 'failed_kept' : 'failed_missing') : generated ? (manifest ? 'updated' : 'not_published') : 'kept';
    const entry = generated && !manifest ? { ...results[code], dataDate: results[code].extractDate.slice(0, 10) } : served.countries[code];
    return {
      code,
      status,
      dataDate: entry ? entryDataDate(entry) : null,
      total: entry?.total ?? null,
      bytes: entry?.bytes ?? null,
      files: entry?.files ?? null,
      errors
    };
  });
}

const STATUS_LABELS = {
  updated: '✅ mis à jour',
  kept: '➖ conservé (non demandé)',
  failed_kept: '❌ en échec : version précédente conservée',
  failed_missing: '❌ en échec : pays non couvert',
  not_published: '⏸ généré, non publié',
  removed: '🗑 retiré (absent de countries.json)'
};

/**
 * Résumé Markdown (page du lancement).
 * @param {{
 *   version: string, statuses: ReturnType<typeof countryStatuses>, results: Record<string, CountryResult>, previous: any,
 *   plan: { totalBytes: number, byCountry: any[], deletions: string[] } | null, maxStorageBytes: number, blocking: string | null, published: boolean
 * }} input
 */
export function summaryMarkdown({ version, statuses, results, previous, plan, maxStorageBytes, blocking, published }) {
  const lines = [`## Tuiles de lieux OSM : version ${version || '(aucune)'}`, ''];
  if (blocking) lines.push(`**${blocking}**`, '');
  else if (!published) lines.push('**Aucun pays à publier : la version en service ne change pas.**', '');
  else lines.push(statuses.some((s) => s.errors.length) ? 'Publiée, **avec des pays en échec** (le lancement se termine en échec pour alerter).' : 'Publiée, tous les pays demandés sont à jour.', '');

  lines.push('| Pays | Statut | Données | Lieux | Taille | Fichiers |', '|---|---|---|---:|---:|---:|');
  for (const s of statuses) {
    lines.push(`| ${s.code} | ${STATUS_LABELS[s.status]} | ${s.dataDate ?? '—'} | ${s.total ?? '—'} | ${s.bytes === null ? '—' : mb(s.bytes)} | ${s.files ?? '—'} |`);
  }
  lines.push('');
  if (plan) {
    lines.push(`Stockage après publication : ${mb(plan.totalBytes)} (plafond ${mb(maxStorageBytes)}) ; ${plan.deletions.length} dossier(s) ou fichier(s) à supprimer.`, '');
  }
  const errors = statuses.flatMap((s) => s.errors);
  for (const e of errors) lines.push(`- ❌ ${e}`);
  if (errors.length) lines.push('');

  for (const [code, r] of Object.entries(results)) {
    const before = previous?.countries?.[code];
    lines.push(`### ${code}`, '');
    lines.push(`- Données : extrait \`${r.extract}\` du ${r.extractDate}`);
    lines.push(`- Fichiers : ${r.files}, ${mb(r.bytes)} au total, le plus gros ${(r.maxFileBytes / 1024).toFixed(0)} Ko (\`${r.maxFile}\`)`);
    lines.push('', '| Catégorie | Lieux | Version précédente |', '|---|---:|---:|');
    const categories = [...new Set([...Object.keys(r.counts), ...Object.keys(before?.counts ?? {})])].sort();
    for (const c of categories) lines.push(`| ${c} | ${r.counts[c] ?? 0} | ${before?.counts?.[c] ?? '—'} |`);
    lines.push(`| **total** | **${r.total}** | ${before?.total ?? '—'} |`, '');
  }
  return lines.join('\n');
}
