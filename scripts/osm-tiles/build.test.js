import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { collectTiles, compareTileIds, readLines, writeTiles } from './build.js';

const OPTIONS = { cellDeg: 0.2, heritageFallback: false, country: 'FR', nameLanguages: ['en', 'fr', 'nl'] };

const feature = (id, lon, lat, properties) => JSON.stringify({ type: 'Feature', id, geometry: { type: 'Point', coordinates: [lon, lat] }, properties });

/** Export osmium simulé : séparateur RS, doublon, objet hors catégorie. */
const LINES = [
  `\x1e${feature('n20', 4.39, 45.06, { amenity: 'restaurant', name: 'B' })}`,
  feature('n10', 4.38, 45.07, { amenity: 'restaurant', name: 'A' }),
  feature('n30', 4.84, 45.76, { historic: 'wayside_cross' }),
  feature('n40', 4.84, 45.76, { shop: 'bakery', name: 'Pain' }),
  feature('n10', 4.38, 45.07, { amenity: 'restaurant', name: 'A' }),
  '',
  feature('n50', -4.49, 48.39, { leisure: 'park', name: 'Brest', 'name:br': 'Brest' }),
  feature('n60', -4.48, 48.38, { amenity: 'restaurant', name: 'Ti Breizh - Maison bretonne', 'name:fr': 'Maison bretonne', 'name:en': 'Ti Breizh - Maison bretonne' })
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
    const { tiles, counts, total } = await collectTiles(LINES, OPTIONS);
    expect(total).toBe(5);
    expect(counts).toEqual({ park: 1, restaurant: 3, small_heritage: 1 });
    expect([...tiles.keys()].sort(compareTileIds)).toEqual(['225_21', '228_24', '241_-23']);
    expect(tiles.get('225_21').map((e) => e[0])).toEqual(['n10', 'n20']);
  });

  it('écrit des fichiers gzip au format v2 (names, puis code pays)', async () => {
    const out = tmp();
    const { tiles } = await collectTiles(LINES, OPTIONS);
    const written = writeTiles(out, '2026-09-24/FR/0.2', tiles, '2026-09-24');
    expect(written.files).toBe(3);
    expect(written.tiles).toEqual(['225_21', '228_24', '241_-23']);
    const tile = JSON.parse(gunzipSync(readFileSync(join(out, '2026-09-24/FR/0.2/241_-23.json.gz'))));
    expect(tile).toEqual({
      v: 2,
      dataDate: '2026-09-24',
      tile: '241_-23',
      places: [
        ['n50', 'park', 'park', 'Brest', 48.39, -4.49, {}, null, 'FR'],
        ['n60', 'restaurant', 'restaurant', 'Ti Breizh - Maison bretonne', 48.38, -4.48, {}, { fr: 'Maison bretonne' }, 'FR']
      ]
    });
  });

  it('est déterministe : même entrée, fichiers identiques octet pour octet', async () => {
    const [a, b] = [tmp(), tmp()];
    for (const out of [a, b]) {
      const { tiles } = await collectTiles([...LINES].reverse(), OPTIONS);
      writeTiles(out, 'v/FR/0.2', tiles, '2026-09-24');
    }
    const files = readdirSync(join(a, 'v/FR/0.2')).sort();
    expect(files).toEqual(readdirSync(join(b, 'v/FR/0.2')).sort());
    for (const f of files) expect(readFileSync(join(a, 'v/FR/0.2', f)).equals(readFileSync(join(b, 'v/FR/0.2', f))), f).toBe(true);
  });
});
