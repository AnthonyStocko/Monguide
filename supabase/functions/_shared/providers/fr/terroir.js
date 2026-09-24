import { ExternalError } from '../../errors.js';
import { fetchExternal } from '../../http.js';
import { cachedValue } from '../../services/cachedValue.js';
import { runSource } from '../../services/sourceRunner.js';
import { communesAround } from './admin.js';
import { resolveCsvResource } from './dataGouv.js';

/**
 * Produits du terroir : appellations d'origine (AOC/AOP) par commune,
 * d'après le jeu "Aires géographiques des AOC/AOP" de l'INAO sur
 * data.gouv.fr. Aucun jeu national équivalent n'a été trouvé pour les IGP.
 * Le fichier (CSV d'environ 3,6 Mo, 65 000 lignes, encodé en Windows-1252,
 * non exposé par l'API tabulaire) est téléchargé lors d'un défaut de cache,
 * puis découpé par département.
 */
export const INAO_DATASET = '53698ecca3a729239d203579';

/** Département d'un code commune INSEE ("69264" -> "69", "97411" -> "974", "2A004" -> "2A"). */
export function departmentOfCommune(code) {
  return code.startsWith('97') ? code.slice(0, 3) : code.slice(0, 2);
}

/**
 * Découpe une ligne CSV séparée par des points-virgules (guillemets gérés).
 * @param {string} line
 * @returns {string[]}
 */
export function splitCsvLine(line) {
  const out = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') {
      out.push(field);
      field = '';
    } else field += c;
  }
  out.push(field);
  return out;
}

/**
 * Index { département: { commune: [appellations] } } du CSV de l'INAO
 * (colonnes CI = code INSEE, "Aire géographique" = appellation).
 * @param {string} csv
 * @returns {Record<string, Record<string, string[]>>}
 */
export function indexInaoCsv(csv) {
  const [header, ...lines] = csv.split(/\r?\n/);
  const cols = splitCsvLine(header).map((h) => h.trim());
  const ci = cols.indexOf('CI');
  const aire = cols.findIndex((h) => /^Aire g/i.test(h));
  if (ci < 0 || aire < 0) throw new TypeError('INAO: colonnes CI / Aire géographique introuvables');

  const index = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const f = splitCsvLine(line);
    const code = f[ci]?.trim();
    const name = f[aire]?.trim();
    if (!code || !name) continue;
    const dep = departmentOfCommune(code);
    const communes = (index[dep] ??= {});
    const list = (communes[code] ??= []);
    if (!list.includes(name)) list.push(name);
  }
  return index;
}

/**
 * Appellations des communes, celles de la commune de destination en premier.
 * @param {{ local: string | null, codes: string[] }} communes
 * @param {Record<string, string[]>} byCommune
 * @returns {import('../types.js').Appellation[]}
 */
export function appellationsFor(communes, byCommune) {
  const local = new Set(communes.local ? byCommune[communes.local] ?? [] : []);
  const nearby = new Set(communes.codes.flatMap((c) => byCommune[c] ?? []));
  return [
    ...[...local].sort((a, b) => a.localeCompare(b, 'fr')).map((name) => ({ name, local: true })),
    ...[...nearby].filter((n) => !local.has(n)).sort((a, b) => a.localeCompare(b, 'fr')).map((name) => ({ name, local: false }))
  ];
}

/**
 * @param {import('../types.js').Point} point
 * @param {import('../types.js').ProviderContext} ctx
 */
export function terroir(point, ctx) {
  const ttlSec = ctx.rules.cacheTtlSec.terroir;
  const radiusKm = ctx.rules.terroir.neighborRadiusKm;

  return runSource({
    name: 'terroir',
    cacheSource: 'terroir',
    params: { lat: point.lat, lon: point.lon, radius: radiusKm },
    ttlSec,
    cache: ctx.cache,
    fetcher: async () => {
      const communes = await communesAround(point, radiusKm, ctx);
      const departments = [...new Set(communes.codes.map(departmentOfCommune))];

      // Un seul téléchargement du CSV, partagé par les départements absents du cache.
      let index;
      const loadIndex = async () => {
        index ??= (async () => {
          const resource = await resolveCsvResource(INAO_DATASET, ctx);
          const res = await fetchExternal(resource.url, { source: 'inao', timeoutMs: 15000 });
          const csv = new TextDecoder('windows-1252').decode(await res.arrayBuffer());
          return indexInaoCsv(csv);
        })();
        return index;
      };

      const perDepartment = await Promise.all(
        departments.map((dep) => cachedValue(ctx.cache, 'inao', { dep }, ttlSec, async () => (await loadIndex())[dep] ?? {}))
      );
      if (!perDepartment.length) throw new ExternalError('inao', null, false);
      return appellationsFor(communes, Object.assign({}, ...perDepartment));
    }
  });
}
