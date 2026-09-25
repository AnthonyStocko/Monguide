import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { collectTiles, compareTileIds, readLines, writeTiles } from './build.js';
import { buildManifest, buildPointer, checkResults, versionsToKeep } from './manifest.js';

const CHECKS = { maxDropRatio: 0.2, minCountForDropCheck: 100, maxFileBytes: 50 * 1024 * 1024 };

const feature = (id, lon, lat, properties) => JSON.stringify({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [lon, lat] }, properties });

/** Export osmium simulé : séparateur RS, doublon, objet hors catégorie. */
const LINES = [
  `\x1e${feature('n20', 4.39, 45.06, { amenity: 'restaurant', name: 'B' })}`,
  feature('n10', 4.38, 45.07, { amenity: 'restaurant', name: 'A' }),
  feature('n30', 4.84, 45.76, { historic: 'wayside_cross' }),
  feature('n40', 4.84, 45.76, { shop: 'bakery', name: 'Pain' }),
  feature('n10', 4.38, 45.07, { amenity: 'restaurant', name: 'A' }),
  '',
  feature('n50', -4.49, 48.39, { leisure: 'park', name: 'Brest' })
];

const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), 'osm-tiles-'));
  dirs.push(d);
  return d;
};

describe('readLines', () => {
  it('ne coupe que sur \n : U+2028 et U+2029 restent dans la ligne', async () => {
    const path = join(tmp(), 'export.geojsonseq');
    const description = 'Pont du XIIe siècle.\u2028Reconstruit en 1993.\u2029Fin';
    writeFileSync(path, `${feature('n1', 4.8, 45.7, { amenity: 'restaurant', name: 'A', description })}\n${feature('n2', 4.8, 45.7, { amenity: 'restaurant', name: 'B' })}`);
    const lines = [];
    for await (const line of readLines(path)) lines.push(line);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).properties.description).toBe(description);
  });
});

describe('collectTiles / writeTiles', () => {
  it('répartit les lieux dans les cases, sans doublon, triés', async () => {
    const { tiles, counts, total } = await collectTiles(LINES, { cellDeg: 0.2, heritageFallback: false });
    expect(total).toBe(4);
    expect(counts).toEqual({ park: 1, restaurant: 2, small_heritage: 1 });
    expect([...tiles.keys()].sort(compareTileIds)).toEqual(['225_21', '228_24', '241_-23']);
    expect(tiles.get('225_21').map((e) => e[0])).toEqual(['n10', 'n20']);
  });

  it('écrit des fichiers gzip au format v1', async () => {
    const out = tmp();
    const { tiles } = await collectTiles(LINES, { cellDeg: 0.2, heritageFallback: false });
    const written = writeTiles(out, '2026-09-24/FR/0.2', tiles, '2026-09-24');
    expect(written.files).toBe(3);
    expect(written.tiles).toEqual(['225_21', '228_24', '241_-23']);
    const tile = JSON.parse(gunzipSync(readFileSync(join(out, '2026-09-24/FR/0.2/241_-23.json.gz'))));
    expect(tile).toEqual({ v: 1, dataDate: '2026-09-24', tile: '241_-23', places: [['n50', 'park', 'park', 'Brest', 48.39, -4.49, {}]] });
  });

  it('est déterministe : même entrée, fichiers identiques octet pour octet', async () => {
    const [a, b] = [tmp(), tmp()];
    for (const out of [a, b]) {
      const { tiles } = await collectTiles([...LINES].reverse(), { cellDeg: 0.2, heritageFallback: false });
      writeTiles(out, 'v/FR/0.2', tiles, '2026-09-24');
    }
    const files = readdirSync(join(a, 'v/FR/0.2')).sort();
    expect(files).toEqual(readdirSync(join(b, 'v/FR/0.2')).sort());
    for (const f of files) expect(readFileSync(join(a, 'v/FR/0.2', f)).equals(readFileSync(join(b, 'v/FR/0.2', f))), f).toBe(true);
  });
});

const result = (overrides = {}) => ({
  path: '2026-10-03/FR/0.2',
  extract: 'europe/france',
  extractDate: '2026-10-03T20:21:20Z',
  counts: { restaurant: 89000, small_heritage: 110000, museum: 50 },
  total: 199050,
  tiles: ['225_21'],
  files: 1,
  bytes: 100,
  maxFileBytes: 100,
  maxFile: '2026-10-03/FR/0.2/225_21.json.gz',
  ...overrides
});

const PREVIOUS = {
  v: 1,
  dataDate: '2026-09-24',
  cellDeg: 0.2,
  countries: {
    FR: { path: '2026-09-24/FR/0.2', total: 200000, counts: { restaurant: 90000, small_heritage: 110000, museum: 90 } },
    LI: { path: '2026-08-01/LI/0.2', total: 300, counts: { restaurant: 300 } }
  }
};

describe('checkResults', () => {
  const countries = [{ code: 'FR', minRestaurants: 60000 }];

  it('accepte une version comparable à celle en service', () => {
    expect(checkResults({ results: { FR: result() }, previous: PREVIOUS, countries, checks: CHECKS })).toEqual([]);
  });

  it('accepte une première version (rien en service)', () => {
    expect(checkResults({ results: { FR: result() }, previous: null, countries, checks: CHECKS })).toEqual([]);
  });

  it('refuse une baisse du total de plus de 20 %', () => {
    const errors = checkResults({ results: { FR: result({ total: 150000, counts: { restaurant: 89000, small_heritage: 61000 } }) }, previous: PREVIOUS, countries, checks: CHECKS });
    expect(errors.some((e) => e.includes('150000 lieux contre 200000'))).toBe(true);
    expect(errors.some((e) => e.includes('small_heritage 61000 contre 110000'))).toBe(true);
  });

  it('refuse la baisse d’une seule catégorie, mais ignore les petites catégories', () => {
    const errors = checkResults({
      results: { FR: result({ counts: { restaurant: 70000, small_heritage: 129000, museum: 10 }, total: 199010 }) },
      previous: PREVIOUS,
      countries,
      checks: CHECKS
    });
    expect(errors).toEqual(['FR : restaurant 70000 contre 90000 dans la version en service (baisse de 22 %).']);
  });

  it('refuse un nombre de restaurants sous le minimum absolu, même sans version en service', () => {
    const errors = checkResults({ results: { FR: result({ counts: { restaurant: 5000 } }) }, previous: null, countries, checks: CHECKS });
    expect(errors).toEqual(['FR : 5000 restaurants, minimum attendu 60000.']);
  });

  it('refuse un fichier trop gros', () => {
    const errors = checkResults({ results: { FR: result({ maxFileBytes: CHECKS.maxFileBytes }) }, previous: null, countries, checks: CHECKS });
    expect(errors[0]).toMatch(/limite 52428800/);
  });
});

describe('buildManifest', () => {
  it('reprend les pays non regénérés avec leurs fichiers d’origine', () => {
    const m = buildManifest({ version: '2026-10-03', cellDeg: 0.2, results: { FR: result() }, previous: PREVIOUS });
    expect(m.dataDate).toBe('2026-10-03');
    expect(Object.keys(m.countries)).toEqual(['FR', 'LI']);
    expect(m.countries.FR.path).toBe('2026-10-03/FR/0.2');
    expect(m.countries.LI.path).toBe('2026-08-01/LI/0.2');
  });

  it('refuse de mélanger deux pas de grille', () => {
    expect(() => buildManifest({ version: '2026-10-03', cellDeg: 0.1, results: { FR: result() }, previous: PREVIOUS })).toThrow(/LI/);
  });
});

describe('buildPointer / versionsToKeep', () => {
  it('pointe vers la nouvelle version et garde la précédente', () => {
    const pointer = buildPointer('2026-10-03', { dataDate: '2026-09-24', previous: '2026-08-01' });
    expect(pointer).toEqual({ dataDate: '2026-10-03', manifest: '2026-10-03/manifest.json', previous: '2026-09-24' });
    const manifest = buildManifest({ version: '2026-10-03', cellDeg: 0.2, results: { FR: result() }, previous: PREVIOUS });
    expect(versionsToKeep({ pointer, manifest, previousManifest: PREVIOUS })).toEqual(['2026-08-01', '2026-09-24', '2026-10-03']);
  });

  it('regénérer la même version garde sa précédente', () => {
    expect(buildPointer('2026-09-24', { dataDate: '2026-09-24', previous: '2026-08-01' }).previous).toBe('2026-08-01');
    expect(buildPointer('2026-09-24', null).previous).toBeNull();
  });

  it('ne garde que deux versions quand tous les pays sont regénérés', () => {
    const pointer = buildPointer('2026-11-03', { dataDate: '2026-10-03', previous: '2026-09-24' });
    const manifest = { countries: { FR: { path: '2026-11-03/FR/0.2' } } };
    const previousManifest = { countries: { FR: { path: '2026-10-03/FR/0.2' } } };
    expect(versionsToKeep({ pointer, manifest, previousManifest })).toEqual(['2026-10-03', '2026-11-03']);
  });
});
