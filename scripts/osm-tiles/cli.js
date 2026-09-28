#!/usr/bin/env node
/**
 * Génération des tuiles de lieux OSM (workflow .github/workflows/osm-tiles.yml,
 * docs/osm-tiles.md).
 *
 *   node scripts/osm-tiles/cli.js countries [--only BE | BE,LU | all]
 *     pays à traiter, "code:extrait Geofabrik" séparés par des espaces
 *   node scripts/osm-tiles/cli.js filters | user-agent
 *     filtre osmium tags-filter, User-Agent des téléchargements
 *   node scripts/osm-tiles/cli.js build --country FR --input FR.geojsonseq
 *       --extract-date 2026-09-24T20:21:20Z --version 2026-09-24 --out out
 *     tuiles dans out/<version>/<pays>/<cellDeg>/, résultat dans out/results/<pays>.json
 *   node scripts/osm-tiles/cli.js finalize --out out --version 2026-09-24
 *       [--failures dir] [--current current.json] [--previous-manifest manifest.json]
 *       [--older-manifest older.json] [--objects objects.json] [--max-storage-mb 200]
 *     contrôles par pays (un pays en échec garde ses tuiles précédentes),
 *     plafond de stockage, puis out/<version>/manifest.json, out/current.json,
 *     out/delete.txt (à supprimer après publication) et out/failed.txt (pays
 *     en échec) ; sortie GitHub "publish" = true si une version est à
 *     publier. Code de sortie 1 si le plafond est dépassé (rien de publié).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { RULES } from '../../supabase/functions/_shared/domain/config/rules.js';
import { FORMAT_VERSION, collectTiles, readLines, writeTiles } from './build.js';
import { CHECKS, COUNTRIES, MAX_STORAGE_BYTES, OSMIUM_FILTERS, USER_AGENT, configuredNameLanguages, countryConfig, selectCountries } from './config.js';
import { buildManifest, buildPointer, checkCountry, countryStatuses, storageCeilingMessage, storagePlan, summaryMarkdown } from './manifest.js';

const cellDeg = RULES.osm.tiles.cellDeg;
const readJson = (path) => (path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);
const output = (line) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: 'string' },
    country: { type: 'string' },
    input: { type: 'string' },
    'extract-date': { type: 'string' },
    version: { type: 'string' },
    out: { type: 'string' },
    failures: { type: 'string' },
    current: { type: 'string' },
    'previous-manifest': { type: 'string' },
    'older-manifest': { type: 'string' },
    objects: { type: 'string' },
    'max-storage-mb': { type: 'string' }
  }
});

async function build() {
  const country = countryConfig(values.country);
  const started = Date.now();
  // Langues des noms : celles de tous les pays configurés, pour que la tuile d'un pays
  // garde aussi les noms dans la langue des voisins.
  const nameLanguages = configuredNameLanguages(COUNTRIES);
  const { tiles, counts, total } = await collectTiles(readLines(values.input), { cellDeg, heritageFallback: country.heritageFallback, country: country.code, nameLanguages });
  const path = `${values.version}/${country.code}/${cellDeg}`;
  const dataDate = values['extract-date'].slice(0, 10);
  const written = writeTiles(values.out, path, tiles, dataDate);
  const result = { path, format: FORMAT_VERSION, extract: country.geofabrik, extractDate: values['extract-date'], counts, total, ...written };
  mkdirSync(join(values.out, 'results'), { recursive: true });
  writeJson(join(values.out, 'results', `${country.code}.json`), result);
  console.log(`${country.code} : ${total} lieux, ${written.files} tuiles, ${written.bytes} octets, ${Math.round((Date.now() - started) / 1000)} s`);
}

/** Fichiers d'un dossier, clés relatives au dossier de sortie. */
function listFiles(root, dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const path = join(dir, d.name);
    return d.isDirectory() ? listFiles(root, path) : [{ Key: relative(root, path).split('\\').join('/'), Size: statSync(path).size }];
  });
}

/** Échecs des étapes shell (téléchargement, génération) : <dossier>/<pays>.txt. */
function readFailures(dir) {
  const failures = {};
  if (!dir || !existsSync(dir)) return failures;
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
    const code = f.slice(0, -4);
    failures[code] = [`${code} : ${readFileSync(join(dir, f), 'utf8').trim()}`];
  }
  return failures;
}

function finalize() {
  const out = values.out;
  const version = values.version ?? '';
  const resultsDir = join(out, 'results');
  const built = Object.fromEntries(
    (existsSync(resultsDir) ? readdirSync(resultsDir) : [])
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => [f.slice(0, -5), readJson(join(resultsDir, f))])
  );
  const current = readJson(values.current);
  const previous = readJson(values['previous-manifest']);
  const older = readJson(values['older-manifest']);
  const objects = readJson(values.objects) ?? [];
  const maxStorageBytes = values['max-storage-mb'] ? Number(values['max-storage-mb']) * 1024 * 1024 : MAX_STORAGE_BYTES;

  // Contrôles pays par pays : un pays en échec ne bloque pas les autres.
  const failures = readFailures(values.failures);
  const results = {};
  for (const [code, result] of Object.entries(built)) {
    const errors = checkCountry({ code, result, previous: previous?.countries?.[code], minRestaurants: countryConfig(code).minRestaurants, checks: CHECKS });
    if (errors.length) {
      failures[code] = errors;
      // Ses tuiles ne sont pas publiées ; le manifeste garde son dossier précédent.
      rmSync(join(out, result.path.split('/').slice(0, 2).join('/')), { recursive: true, force: true });
    } else {
      results[code] = result;
    }
  }
  const failed = Object.keys(failures).sort();
  writeFileSync(join(out, 'failed.txt'), failed.map((code) => `${code}\n`).join(''));

  let manifest = null;
  let plan = null;
  let blocking = null;
  if (Object.keys(results).length) {
    manifest = buildManifest({ version, cellDeg, results, previous, configured: COUNTRIES.map((c) => c.code) });
    const pointer = buildPointer(version, current);
    // Manifeste de la version précédente du nouveau pointeur (retour arrière) :
    // celui en service, ou sa précédente si l'on regénère la même version.
    const keptPrevious = !pointer.previous ? null : pointer.previous === current?.dataDate ? previous : pointer.previous === current?.previous ? (older ?? undefined) : undefined;
    const manifestText = `${JSON.stringify(manifest, null, 1)}\n`;
    const pointerText = `${JSON.stringify(pointer, null, 1)}\n`;
    const newFiles = [
      ...listFiles(out, join(out, version)).filter((f) => f.Key.endsWith('.json.gz')),
      { Key: `${version}/manifest.json`, Size: Buffer.byteLength(manifestText) },
      { Key: 'current.json', Size: Buffer.byteLength(pointerText) }
    ];
    plan = storagePlan({ objects, newFiles, manifest, pointer, keptPrevious });
    if (plan.totalBytes > maxStorageBytes) {
      blocking = storageCeilingMessage(plan, maxStorageBytes);
    } else {
      mkdirSync(join(out, version), { recursive: true });
      writeFileSync(join(out, version, 'manifest.json'), manifestText);
      writeFileSync(join(out, 'current.json'), pointerText);
      writeFileSync(join(out, 'delete.txt'), plan.deletions.map((d) => `${d}\n`).join(''));
    }
  }
  const published = Boolean(manifest) && !blocking;
  const statuses = countryStatuses({ manifest: published ? manifest : null, previous, results, failures });
  const summary = summaryMarkdown({ version, statuses, results: built, previous, plan, maxStorageBytes, blocking, published });
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  for (const code of failed) for (const e of failures[code]) console.error(`::error title=Tuiles OSM : ${code} en échec::${e}`);
  output(`publish=${published}`);
  if (blocking) {
    console.error(`::error title=Tuiles OSM non publiées::${blocking}`);
    process.exit(1);
  }
}

switch (positionals[0]) {
  case 'countries':
    console.log(selectCountries(values.only).map((c) => `${c.code}:${c.geofabrik}`).join(' '));
    break;
  case 'filters':
    console.log(OSMIUM_FILTERS.join(' '));
    break;
  case 'user-agent':
    console.log(USER_AGENT);
    break;
  case 'build':
    await build();
    break;
  case 'finalize':
    finalize();
    break;
  default:
    console.error('usage : cli.js countries | filters | user-agent | build | finalize (voir l’en-tête du fichier)');
    process.exit(2);
}
