import { classifyIndoor } from '../domain/classifyIndoor.js';
import { ExternalError } from '../errors.js';
import { fetchExternal } from '../http.js';
import { userAgent } from '../meta.js';
import { MUSEUM_TYPES, P, WIKIDATA_SPARQL_URL } from '../providers/eu/wikidata-config.js';

/**
 * Requêtes SPARQL Wikidata pour le patrimoine hors de France. Règles :
 *  - deux requêtes séparées (monuments, musées), jamais une requête combinée ;
 *  - le service wikibase:around en PREMIER dans la clause WHERE, pour que les
 *    autres filtres ne portent que sur les éléments proches ;
 *  - musées : liste fermée de types (VALUES), jamais wdt:P279* ;
 *  - LIMIT dans une sous-requête : les libellés ne sont calculés que pour les
 *    éléments retenus (sinon, plus de 60 s mesurées pour Barcelone) ;
 *  - libellés dans la langue de l'interface, sinon en anglais, sinon dans les
 *    langues locales du pays.
 */

const WIKIDATA_URL = () => globalThis.Deno?.env.get('WIKIDATA_SPARQL_URL') ?? WIKIDATA_SPARQL_URL;

function around(point, radiusKm) {
  return (
    `SERVICE wikibase:around { ?item wdt:${P.coordinates} ?coord . ` +
    `bd:serviceParam wikibase:center "Point(${point.lon} ${point.lat})"^^geo:wktLiteral ; ` +
    `wikibase:radius "${radiusKm}" . }`
  );
}

function labels(languages) {
  return `SERVICE wikibase:label { bd:serviceParam wikibase:language "${languages.join(',')}" . }`;
}

/**
 * Langues des libellés : interface, anglais, langues locales, puis "mul"
 * (libellé multilingue de Wikidata).
 * @param {string} lang
 * @param {string[]} localLanguages
 */
export function labelLanguages(lang, localLanguages) {
  return [...new Set([lang, 'en', ...localLanguages, 'mul'])];
}

/**
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {string[]} languages
 * @param {number} limit
 */
export function buildMonumentsQuery(point, radiusKm, languages, limit) {
  return [
    'SELECT ?item ?itemLabel ?coord WHERE {',
    `  { SELECT DISTINCT ?item ?coord WHERE {`,
    `    ${around(point, radiusKm)}`,
    `    ?item wdt:${P.heritageDesignation} ?designation .`,
    `  } LIMIT ${limit} }`,
    `  ${labels(languages)}`,
    '}'
  ].join('\n');
}

/**
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {string[]} languages
 * @param {number} limit
 */
export function buildMuseumsQuery(point, radiusKm, languages, limit) {
  const types = Object.keys(MUSEUM_TYPES).map((q) => `wd:${q}`).join(' ');
  return [
    'SELECT ?item ?itemLabel ?coord ?type WHERE {',
    `  { SELECT ?item ?coord ?type WHERE {`,
    `    ${around(point, radiusKm)}`,
    `    VALUES ?type { ${types} }`,
    `    ?item wdt:${P.instanceOf} ?type .`,
    `  } LIMIT ${limit} }`,
    `  ${labels(languages)}`,
    '}'
  ].join('\n');
}

/** "Point(lon lat)" -> { lat, lon } */
export function parseWktPoint(value) {
  const m = /^Point\(([-\d.eE]+) ([-\d.eE]+)\)$/.exec(value ?? '');
  if (!m) return null;
  const lon = Number(m[1]);
  const lat = Number(m[2]);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}

/**
 * Lignes SPARQL -> Places (un élément par identifiant Q ; éléments sans
 * libellé ignorés : le service renvoie alors l'identifiant lui-même).
 * @param {any[]} bindings
 * @param {'monument' | 'museum'} category
 * @returns {import('../domain/model.js').Place[]}
 */
export function bindingsToPlaces(bindings, category) {
  const seen = new Set();
  const places = [];
  for (const b of bindings) {
    const qid = b.item?.value?.split('/').pop();
    const name = b.itemLabel?.value?.trim();
    const pos = parseWktPoint(b.coord?.value);
    if (!qid || !/^Q\d+$/.test(qid) || seen.has(qid) || !name || name === qid || !pos) continue;
    seen.add(qid);
    const type = b.type ? MUSEUM_TYPES[b.type.value.split('/').pop()] : undefined;
    places.push({
      id: `wikidata:${qid}`,
      name,
      category,
      lat: pos.lat,
      lon: pos.lon,
      source: 'wikidata',
      certified: true,
      certification: category === 'museum' ? 'referenced_museum' : 'protected_heritage',
      indoor: classifyIndoor({ category, name, type }),
      url: `https://www.wikidata.org/wiki/${qid}`,
      wikidata: qid
    });
  }
  return places;
}

/**
 * Exécute une requête SPARQL. Exception à la règle HTTP globale : délai de
 * 15 s (rules.wikidata.timeoutSec) et un seul essai (aucune nouvelle tentative,
 * en particulier sur 429). En-tête Api-User-Agent en plus du User-Agent, que
 * Supabase complète de sa propre signature.
 * @param {string} query
 * @param {number} timeoutSec
 * @returns {Promise<any[]>} lignes (results.bindings)
 */
export async function runSparql(query, timeoutSec) {
  const res = await fetchExternal(`${WIKIDATA_URL()}?${new URLSearchParams({ query })}`, {
    source: 'wikidata',
    headers: { Accept: 'application/sparql-results+json', 'Api-User-Agent': userAgent() },
    timeoutMs: timeoutSec * 1000,
    maxAttempts: 1
  });
  try {
    return (await res.json()).results.bindings;
  } catch {
    throw new ExternalError('wikidata', res.status, false);
  }
}
