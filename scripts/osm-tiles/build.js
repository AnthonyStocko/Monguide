import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { tileIdForPoint } from '../../supabase/functions/_shared/domain/osmGrid.js';
import { compareEntries, featureToEntry } from './features.js';

/**
 * Lignes d'un fichier, coupées sur "\n" seulement. readline de Node coupe
 * aussi sur U+2028 et U+2029, qu'osmium laisse tels quels dans le JSON (des
 * descriptions OSM en contiennent) : l'objet serait coupé en deux.
 * @param {string} path
 */
export async function* readLines(path) {
  let rest = '';
  for await (const chunk of createReadStream(path, { encoding: 'utf8', highWaterMark: 1 << 20 })) {
    const parts = (rest + chunk).split('\n');
    rest = parts.pop();
    yield* parts;
  }
  if (rest) yield rest;
}

/** Version du format des tuiles (docs/osm-tiles.md). */
export const FORMAT_VERSION = 1;

/**
 * Répartit dans les cases les objets d'un export osmium au format GeoJSON
 * séquentiel (un objet par ligne, précédé ou non du séparateur RS).
 * @param {AsyncIterable<string> | Iterable<string>} lines
 * @param {{ cellDeg: number, heritageFallback: boolean }} options
 * @returns {Promise<{ tiles: Map<string, any[]>, counts: Record<string, number>, total: number }>}
 */
export async function collectTiles(lines, { cellDeg, heritageFallback }) {
  const tiles = new Map();
  const seen = new Set();
  for await (const raw of lines) {
    const line = raw.replace(/^\x1e/, '').trim();
    if (!line) continue;
    const entry = featureToEntry(JSON.parse(line), { heritageFallback });
    // Un même objet peut sortir deux fois (chemin fermé en ligne et en surface) : on garde le premier.
    if (!entry || seen.has(entry[0])) continue;
    seen.add(entry[0]);
    const tile = tileIdForPoint(entry[4], entry[5], cellDeg);
    if (!tiles.has(tile)) tiles.set(tile, []);
    tiles.get(tile).push(entry);
  }
  const counts = {};
  for (const entries of tiles.values()) {
    entries.sort(compareEntries);
    for (const e of entries) counts[e[1]] = (counts[e[1]] ?? 0) + 1;
  }
  return { tiles, counts: sortKeys(counts), total: seen.size };
}

const sortKeys = (obj) => Object.fromEntries(Object.entries(obj).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/** Tri des identifiants de case : iy puis ix, numériquement. */
export function compareTileIds(a, b) {
  const [ay, ax] = a.split('_').map(Number);
  const [by, bx] = b.split('_').map(Number);
  return ay - by || ax - bx;
}

/**
 * Contenu gzip d'une tuile. Sortie déterministe : JSON compact, lieux triés,
 * en-tête gzip sans date ni nom de fichier (zlib de Node).
 * @param {{ dataDate: string, tile: string, places: any[] }} tile
 */
export function encodeTile({ dataDate, tile, places }) {
  return gzipSync(JSON.stringify({ v: FORMAT_VERSION, dataDate, tile, places }), { level: 9 });
}

/**
 * Écrit les tuiles d'un pays dans <outDir>/<path>/<iy_ix>.json.gz.
 * @param {string} outDir
 * @param {string} path "<version>/<pays>/<cellDeg>"
 * @param {Map<string, any[]>} tiles
 * @param {string} dataDate
 * @returns {{ tiles: string[], files: number, bytes: number, maxFileBytes: number, maxFile: string | null }}
 */
export function writeTiles(outDir, path, tiles, dataDate) {
  const dir = join(outDir, path);
  mkdirSync(dir, { recursive: true });
  const ids = [...tiles.keys()].sort(compareTileIds);
  let bytes = 0;
  let maxFileBytes = 0;
  let maxFile = null;
  for (const tile of ids) {
    const data = encodeTile({ dataDate, tile, places: tiles.get(tile) });
    writeFileSync(join(dir, `${tile}.json.gz`), data);
    bytes += data.length;
    if (data.length > maxFileBytes) {
      maxFileBytes = data.length;
      maxFile = `${path}/${tile}.json.gz`;
    }
  }
  return { tiles: ids, files: ids.length, bytes, maxFileBytes, maxFile };
}
