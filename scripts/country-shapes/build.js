#!/usr/bin/env node
/**
 * Contours approximatifs des pays pris en charge, pour signaler une
 * couverture partielle des lieux OSM (docs/osm-tiles.md, « Couverture
 * partielle ») :
 *
 *   node --use-system-ca scripts/country-shapes/build.js [index-v1.json]
 *
 * Source : les polygones des extraits Geofabrik (https://download.geofabrik.de/index-v1.json,
 * un par code ISO, les mêmes que ceux des tuiles), simplifiés à environ 1 km
 * (Douglas-Peucker, 0,01°) et arrondis à 0,001°. Ces polygones débordent de
 * quelques kilomètres des frontières (marge des extraits, À VÉRIFIER) et
 * couvrent une bande de mer. Écrit
 * supabase/functions/_shared/domain/config/countryShapes.js (généré : ne pas
 * modifier à la main).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { SUPPORTED_COUNTRIES } from '../../supabase/functions/_shared/domain/config/countries.js';
import { TOLERANCE_DEG, simplifyGeometry } from './simplify.js';

const INDEX_URL = 'https://download.geofabrik.de/index-v1.json';
const USER_AGENT = 'MonGuide-osm-tiles/1.0 (+https://github.com/AnthonyStocko/Monguide)';
const OUT = new URL('../../supabase/functions/_shared/domain/config/countryShapes.js', import.meta.url);

async function main() {
  const text = process.argv[2]
    ? readFileSync(process.argv[2], 'utf8')
    : await (await fetch(INDEX_URL, { headers: { 'User-Agent': USER_AGENT } })).text();
  const index = JSON.parse(text);
  const shapes = {};
  for (const code of Object.keys(SUPPORTED_COUNTRIES).sort()) {
    // Extrait du pays entier : celui du code ISO dont le parent n'est pas un extrait du même pays.
    const matches = index.features.filter((f) => (f.properties['iso3166-1:alpha2'] ?? []).includes(code));
    const ids = new Set(matches.map((f) => f.properties.id));
    const top = matches.filter((f) => !ids.has(f.properties.parent));
    if (top.length !== 1) throw new Error(`${code} : ${top.length} extraits Geofabrik de pays entier`);
    shapes[code] = { extract: `${top[0].properties.parent}/${top[0].properties.id}`, ...simplifyGeometry(top[0].geometry) };
  }
  const points = Object.values(shapes).reduce((n, s) => n + s.polygons.flat(1).reduce((m, r) => m + r.length, 0), 0);
  const body = [
    '// Généré par scripts/country-shapes/build.js : ne pas modifier à la main.',
    `// Contours des extraits Geofabrik (${INDEX_URL}, lu le ${new Date().toISOString().slice(0, 10)}),`,
    `// simplifiés à ${TOLERANCE_DEG}° et arrondis à 0,001° ; ${points} points. Approximatifs : ils débordent`,
    '// des frontières de quelques kilomètres et couvrent une bande de mer (À VÉRIFIER).',
    '',
    '/** @type {Readonly<Record<string, { extract: string, bbox: [number, number, number, number], polygons: [number, number][][][] }>>} */',
    `export const COUNTRY_SHAPES = Object.freeze(${JSON.stringify(shapes)});`,
    ''
  ].join('\n');
  writeFileSync(OUT, body);
  console.log(`${Object.keys(shapes).length} pays, ${points} points, ${body.length} octets -> ${OUT.pathname}`);
}

await main();
