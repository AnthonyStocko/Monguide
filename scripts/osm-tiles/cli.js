#!/usr/bin/env node
/**
 * Génération des tuiles de lieux OSM (workflow .github/workflows/osm-tiles.yml,
 * docs/osm-tiles.md).
 *
 *   node scripts/osm-tiles/cli.js countries [--only FR]
 *     pays à traiter, "code:extrait Geofabrik" séparés par des espaces
 *   node scripts/osm-tiles/cli.js filters | user-agent
 *     filtre osmium tags-filter, User-Agent des téléchargements
 *   node scripts/osm-tiles/cli.js build --country FR --input FR.geojsonseq
 *       --extract-date 2026-09-24T20:21:20Z --version 2026-09-24 --out out
 *     tuiles dans out/<version>/<pays>/<cellDeg>/, résultat dans out/results/<pays>.json
 *   node scripts/osm-tiles/cli.js finalize --out out --version 2026-09-24
 *       [--current current.json] [--previous-manifest manifest.json]
 *     contrôles, puis out/<version>/manifest.json, out/current.json et
 *     out/keep.txt (versions à conserver) ; code de sortie 1 si un contrôle échoue
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { RULES } from '../../supabase/functions/_shared/domain/config/rules.js';
import { collectTiles, readLines, writeTiles } from './build.js';
import { CHECKS, COUNTRIES, OSMIUM_FILTERS, USER_AGENT, countryConfig } from './config.js';
import { buildManifest, buildPointer, checkResults, summaryMarkdown, versionsToKeep } from './manifest.js';

const cellDeg = RULES.osm.tiles.cellDeg;
const readJson = (path) => (path && existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null);
const writeJson = (path, value) => writeFileSync(path, `${JSON.stringify(value, null, 1)}\n`);

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    only: { type: 'string' },
    country: { type: 'string' },
    input: { type: 'string' },
    'extract-date': { type: 'string' },
    version: { type: 'string' },
    out: { type: 'string' },
    current: { type: 'string' },
    'previous-manifest': { type: 'string' }
  }
});

async function build() {
  const country = countryConfig(values.country);
  const started = Date.now();
  const { tiles, counts, total } = await collectTiles(readLines(values.input), { cellDeg, heritageFallback: country.heritageFallback });
  const path = `${values.version}/${country.code}/${cellDeg}`;
  const dataDate = values['extract-date'].slice(0, 10);
  const written = writeTiles(values.out, path, tiles, dataDate);
  const result = { path, extract: country.geofabrik, extractDate: values['extract-date'], counts, total, ...written };
  mkdirSync(join(values.out, 'results'), { recursive: true });
  writeJson(join(values.out, 'results', `${country.code}.json`), result);
  console.log(`${country.code} : ${total} lieux, ${written.files} tuiles, ${written.bytes} octets, ${Math.round((Date.now() - started) / 1000)} s`);
}

function finalize() {
  const dir = join(values.out, 'results');
  const results = Object.fromEntries(
    readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => [f.slice(0, -5), readJson(join(dir, f))])
  );
  const current = readJson(values.current);
  const previous = readJson(values['previous-manifest']);
  const manifest = buildManifest({ version: values.version, cellDeg, results, previous });
  const errors = checkResults({ results, previous, countries: COUNTRIES, checks: CHECKS });
  const summary = summaryMarkdown({ manifest, results, errors, previous });
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  if (errors.length) {
    for (const e of errors) console.error(`::error title=Tuiles OSM non publiées::${e}`);
    process.exit(1);
  }
  const pointer = buildPointer(values.version, current);
  writeJson(join(values.out, values.version, 'manifest.json'), manifest);
  writeJson(join(values.out, 'current.json'), pointer);
  writeFileSync(join(values.out, 'keep.txt'), `${versionsToKeep({ pointer, manifest, previousManifest: previous }).join('\n')}\n`);
}

switch (positionals[0]) {
  case 'countries':
    console.log((values.only ? [countryConfig(values.only.trim().toUpperCase())] : COUNTRIES).map((c) => `${c.code}:${c.geofabrik}`).join(' '));
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
