import { classifyIndoor } from '../domain/classifyIndoor.js';
import { ATTRACTION_CLASSES, PARK_CLASSES, REDIRECT_BADGES } from '../domain/config/placeClasses.js';
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
 *  - monuments : les plus proches d'abord (ORDER BY ?dist avant le LIMIT).
 *    Sans tri, le service en rend 300 au hasard dans le rayon : à Barcelone
 *    (5 628 monuments à 10 km), médiane à 5,1 km au lieu de 0,2 km, et des
 *    séjours à pied dont les visites sont trop loin des restaurants. Musées :
 *    pas de tri (rarement plus de 300, et le tri allonge une requête déjà lente) ;
 *  - libellés dans la langue de l'interface, sinon en anglais, sinon dans les
 *    langues locales du pays (nom choisi par bindingsToPlaces, nameLang) ;
 *    les libellés français, anglais et locaux qui diffèrent du nom sont
 *    gardés dans names (affichage : displayName) ;
 *  - fermeture : dates P3999 et P576, état d'usage P5817 ; articles qui
 *    sont des liens vers une redirection (REDIRECT_BADGES) comptés à part ;
 *  - signaux de notoriété (withSignals : articles Wikipédia, natures,
 *    désignations, ensembles, articles dans la langue de l'interface et du
 *    pays) agrégés par élément (GROUP BY) APRÈS le LIMIT, sur les seuls
 *    éléments retenus ;
 *  - lieux connus (buildNotableQuery), toutes natures : au moins minSitelinks
 *    articles, les plus connus d'abord, sans les éléments qui ont une
 *    population (communes, quartiers). Sans eux, les 300 monuments les plus
 *    proches remplissent un rayon de 0,8 km à Bruxelles et de 0,4 km à
 *    Barcelone (Sagrada Família absente).
 */

const WIKIDATA_URL = () => globalThis.Deno?.env.get('WIKIDATA_SPARQL_URL') ?? WIKIDATA_SPARQL_URL;

/** @param {{ distance?: boolean }} [options] distance : ?dist, distance au centre en km */
function around(point, radiusKm, { distance = false } = {}) {
  return (
    `SERVICE wikibase:around { ?item wdt:${P.coordinates} ?c . ` +
    `bd:serviceParam wikibase:center "Point(${point.lon} ${point.lat})"^^geo:wktLiteral ; ` +
    `wikibase:radius "${radiusKm}"${distance ? ' ; wikibase:distance ?dist' : ''} . }`
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
 * Wikipédias dont la présence d'un article compte (signaux langArticle et
 * localArticle) : langue de l'interface et langues du pays.
 * @param {string} lang
 * @param {string[]} localLanguages
 */
export function articleLanguages(lang, localLanguages) {
  return [...new Set([lang, ...localLanguages])].filter((l) => /^[a-z]{2,3}$/.test(l));
}

/**
 * Langues des libellés gardés (nom et variantes) : français et anglais (les
 * deux langues de l'interface), langue demandée, langues du pays.
 * @param {string} lang
 * @param {string[]} localLanguages
 */
export function nameLanguages(lang, localLanguages) {
  return [...new Set(['fr', 'en', lang, ...localLanguages])].filter((l) => /^[a-z]{2,3}$/.test(l));
}

const wikiIri = (lang) => `<https://${lang}.wikipedia.org/>`;
const redirectBadges = () => Object.keys(REDIRECT_BADGES).map((q) => `wd:${q}`).join(', ');

/** Variables de sortie des requêtes avec signaux. */
const SIGNAL_VARS = '?coord ?sitelinks ?types ?designations ?parts ?wikis ?closures ?states ?redirects ?labels';

/** Agrégats des signaux (sans la position). Libellés : "langue:texte" séparés par des tabulations. */
const SIGNAL_AGGREGATES =
  '(MAX(?n) AS ?sitelinks) (GROUP_CONCAT(DISTINCT ?type) AS ?types) (GROUP_CONCAT(DISTINCT ?designation) AS ?designations) ' +
  '(GROUP_CONCAT(DISTINCT ?part) AS ?parts) (GROUP_CONCAT(DISTINCT ?wiki) AS ?wikis) (GROUP_CONCAT(DISTINCT STR(?closure)) AS ?closures) ' +
  '(GROUP_CONCAT(DISTINCT ?state) AS ?states) (COUNT(DISTINCT ?redirect) AS ?redirects)';
const LABEL_AGGREGATE = '(GROUP_CONCAT(DISTINCT CONCAT(LANG(?label), ":", STR(?label)); separator="\\t") AS ?labels)';

/**
 * Sous-requête qui agrège, par élément, les signaux de notoriété des
 * éléments retenus par `inner` (qui fournit ?item et sa position ?c).
 * @param {string} inner sous-requête SELECT
 * @param {string[]} wikis langues des Wikipédias (articleLanguages)
 * @param {string[]} names langues des libellés gardés (nameLanguages)
 * @returns {string[]} lignes
 */
function withSignals(inner, wikis, names) {
  return [
    `  { SELECT ?item (SAMPLE(?c) AS ?coord) ${SIGNAL_AGGREGATES}${names.length ? ` ${LABEL_AGGREGATE}` : ''} WHERE {`,
    `    { ${inner} }`,
    ...signalClauses(wikis),
    ...(names.length ? [`    OPTIONAL { ?item rdfs:label ?label . FILTER(LANG(?label) IN (${names.map((l) => `"${l}"`).join(', ')})) }`] : []),
    '  } GROUP BY ?item }'
  ];
}

function signalClauses(wikis) {
  return [
    `    OPTIONAL { ?item wdt:${P.closureDate}|wdt:${P.dissolvedDate} ?closure . }`,
    `    OPTIONAL { ?item wdt:${P.stateOfUse} ?state . }`,
    `    OPTIONAL { ?redirect schema:about ?item ; wikibase:badge ?redirectBadge . FILTER(?redirectBadge IN (${redirectBadges()})) }`,
    '    OPTIONAL { ?item wikibase:sitelinks ?n . }',
    `    OPTIONAL { ?item wdt:${P.instanceOf} ?type . }`,
    `    OPTIONAL { ?item wdt:${P.heritageDesignation} ?designation . }`,
    `    OPTIONAL { ?item wdt:${P.partOf} ?part . }`,
    // FILTER IN, jamais VALUES : avec VALUES, le service part de tous les articles de ces Wikipédias
    // (plus de 60 s mesurées pour 122 éléments, contre 0,5 s).
    // Article redirigé : ne compte pas comme un article dans la langue.
    ...(wikis.length
      ? [
          `    OPTIONAL { ?article schema:about ?item ; schema:isPartOf ?wiki . FILTER(?wiki IN (${wikis.map(wikiIri).join(', ')})) ` +
            `FILTER NOT EXISTS { ?article wikibase:badge ?articleBadge . FILTER(?articleBadge IN (${redirectBadges()})) } }`
        ]
      : [])
  ];
}

/**
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {string[]} languages
 * @param {number} limit
 * @param {string[]} [wikis] langues des articles recherchés (articleLanguages)
 * @param {string[]} [names] langues des libellés gardés (nameLanguages)
 */
export function buildMonumentsQuery(point, radiusKm, languages, limit, wikis = [], names = []) {
  const inner = `SELECT DISTINCT ?item ?c ?dist WHERE { ${around(point, radiusKm, { distance: true })} ?item wdt:${P.heritageDesignation} [] . } ORDER BY ?dist LIMIT ${limit}`;
  return [`SELECT ?item ?itemLabel ${SIGNAL_VARS} WHERE {`, ...withSignals(inner, wikis, names), `  ${labels(languages)}`, '}'].join('\n');
}

/**
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {string[]} languages
 * @param {number} limit
 * @param {string[]} [wikis]
 * @param {string[]} [names]
 */
export function buildMuseumsQuery(point, radiusKm, languages, limit, wikis = [], names = []) {
  const types = Object.keys(MUSEUM_TYPES).map((q) => `wd:${q}`).join(' ');
  const inner = `SELECT DISTINCT ?item ?c WHERE { ${around(point, radiusKm)} VALUES ?museumType { ${types} } ?item wdt:${P.instanceOf} ?museumType . } LIMIT ${limit}`;
  return [`SELECT ?item ?itemLabel ${SIGNAL_VARS} WHERE {`, ...withSignals(inner, wikis, names), `  ${labels(languages)}`, '}'].join('\n');
}

/**
 * Lieux connus autour du point : au moins minSitelinks articles Wikipédia,
 * les plus connus d'abord, sans les éléments qui ont une population (P1082 :
 * communes, quartiers, la ville elle-même), et seulement les édifices et
 * œuvres (désignation patrimoniale, architecte, style, créateur) ou les
 * musées, parcs et attractions (ATTRACTION_CLASSES) : ni organisations, ni
 * événements, ni lignes de transport.
 * @param {{ lat: number, lon: number }} point
 * @param {number} radiusKm
 * @param {string[]} languages
 * @param {{ minSitelinks: number, limit: number }} options rules.notoriety.notableQuery
 * @param {string[]} [wikis]
 * @param {string[]} [names]
 */
export function buildNotableQuery(point, radiusKm, languages, { minSitelinks, limit }, wikis = [], names = []) {
  const kinds = [...Object.keys(MUSEUM_TYPES), ...Object.keys(PARK_CLASSES), ...Object.keys(ATTRACTION_CLASSES)].map((q) => `wd:${q}`).join(' ');
  const builtOrArtwork = [P.heritageDesignation, P.architect, P.architecturalStyle, P.creator].map((p) => `wdt:${p}`).join('|');
  const inner =
    `SELECT ?item ?c ?links WHERE { ${around(point, radiusKm)} ?item wikibase:sitelinks ?links . ` +
    `FILTER(?links >= ${Number(minSitelinks)}) FILTER NOT EXISTS { ?item wdt:${P.population} [] . } ` +
    `FILTER(EXISTS { ?item ${builtOrArtwork} [] . } || EXISTS { VALUES ?kind { ${kinds} } ?item wdt:${P.instanceOf} ?kind . }) } ` +
    // Départage par identifiant : à égalité d'articles au seuil, toujours les mêmes lieux.
    `ORDER BY DESC(?links) ?item LIMIT ${Number(limit)}`;
  return [`SELECT ?item ?itemLabel ${SIGNAL_VARS} WHERE {`, ...withSignals(inner, wikis, names), `  ${labels(languages)}`, '}'].join('\n');
}

/**
 * Signaux de notoriété d'éléments connus par leur identifiant (lieux
 * Mérimée, Muséofile et OpenStreetMap portant un identifiant Wikidata).
 * Identifiants limités à Q suivi de chiffres (aucune injection).
 * @param {string[]} qids
 * @param {string[]} wikis
 */
export function buildSignalsQuery(qids, wikis) {
  const values = qids.filter((q) => /^Q\d+$/.test(q)).map((q) => `wd:${q}`).join(' ');
  return [
    `SELECT ?item ${SIGNAL_AGGREGATES} WHERE {`,
    `    VALUES ?item { ${values} }`,
    ...signalClauses(wikis),
    '} GROUP BY ?item'
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

/** Liste d'IRI séparées par des espaces (GROUP_CONCAT) -> identifiants Q. */
const qidsOf = (binding) =>
  (binding?.value ?? '')
    .split(' ')
    .map((iri) => iri.split('/').pop())
    .filter((q) => /^Q\d+$/.test(q ?? ''));

/**
 * Signaux de notoriété d'une ligne (withSignals, buildSignalsQuery) ; null
 * si la ligne n'en porte pas (ancienne requête).
 * @param {any} b
 * @param {{ lang?: string, localLanguages?: string[] }} options
 * @returns {import('../domain/scoring/notoriety.js').PlaceSignals | null}
 */
export function signalsFromBinding(b, { lang, localLanguages = [] } = {}) {
  if (!b.sitelinks && !b.types && !b.designations) return null;
  const wikis = (b.wikis?.value ?? '')
    .split(' ')
    .map((iri) => /^https:\/\/([a-z-]+)\.wikipedia\.org\/$/.exec(iri)?.[1])
    .filter(Boolean);
  const signals = { sitelinks: Number(b.sitelinks?.value ?? 0) || 0, types: qidsOf(b.types), designations: qidsOf(b.designations), partOf: qidsOf(b.parts) };
  const redirects = Number(b.redirects?.value ?? 0) || 0;
  if (redirects) signals.redirects = redirects;
  const closures = (b.closures?.value ?? '').split(' ').filter(Boolean);
  if (closures.length) signals.closures = closures;
  const states = qidsOf(b.states);
  if (states.length) signals.states = states;
  if (lang && wikis.includes(lang)) signals.langArticle = true;
  if (localLanguages.some((l) => wikis.includes(l))) signals.localArticle = true;
  return signals;
}

/**
 * Libellés d'une ligne ("fr:Grand-Place\tnl:Grote Markt") -> { langue: texte }.
 * @param {any} b
 * @returns {Record<string, string>}
 */
export function labelsFromBinding(b) {
  const out = {};
  for (const part of (b.labels?.value ?? '').split('\t')) {
    const i = part.indexOf(':');
    const text = part.slice(i + 1).trim();
    if (i > 0 && text && !(part.slice(0, i) in out)) out[part.slice(0, i)] = text;
  }
  return out;
}

/**
 * Nom d'un élément : premier libellé dans l'ordre des langues (interface,
 * anglais, langues du pays : jamais une langue que l'utilisateur ne lit pas
 * quand un libellé français ou anglais existe), sinon le libellé du service
 * (multilingue "mul"). names : les autres libellés gardés, s'ils diffèrent.
 * @param {Record<string, string>} labels
 * @param {string[]} order langues, par ordre de préférence
 * @param {string | undefined} fallback libellé du service wikibase:label
 * @returns {{ name: string, nameLang?: string, names?: Record<string, string> } | null}
 */
export function chooseName(labels, order, fallback) {
  const nameLang = order.find((l) => labels[l]);
  const name = nameLang ? labels[nameLang] : fallback;
  if (!name) return null;
  const names = Object.fromEntries(Object.entries(labels).filter(([, v]) => v !== name).sort(([a], [b]) => a.localeCompare(b)));
  return { name, ...(nameLang ? { nameLang } : {}), ...(Object.keys(names).length ? { names } : {}) };
}

/**
 * Catégorie d'un lieu connu d'après ses natures : musée (types de
 * MUSEUM_TYPES), parc (PARK_CLASSES), sinon monument.
 * @param {string[]} types
 * @returns {{ category: 'museum' | 'park' | 'monument', museumType?: string }}
 */
export function notableCategory(types) {
  const museum = types.find((t) => t in MUSEUM_TYPES);
  if (museum) return { category: 'museum', museumType: MUSEUM_TYPES[museum] };
  if (types.some((t) => t in PARK_CLASSES)) return { category: 'park' };
  return { category: 'monument' };
}

/**
 * Lignes SPARQL -> Places (un élément par identifiant Q ; éléments sans
 * libellé ignorés : le service renvoie alors l'identifiant lui-même).
 * category "notable" (buildNotableQuery) : catégorie d'après les natures
 * (notableCategory) ; lieu certifié s'il a une désignation patrimoniale
 * (monument protégé) ou une nature de musée (musée référencé), sinon non
 * certifié. Les signaux de notoriété sont gardés dans place.signals.
 * @param {any[]} bindings
 * @param {'monument' | 'museum' | 'notable'} category
 * @param {{ lang?: string, localLanguages?: string[] }} [options] langues des articles (signaux) et ordre
 *   des libellés (chooseName : interface, anglais, langues du pays)
 * @returns {import('../domain/model.js').Place[]}
 */
export function bindingsToPlaces(bindings, category, options = {}) {
  const seen = new Set();
  const places = [];
  const order = options.lang ? labelLanguages(options.lang, options.localLanguages ?? []).filter((l) => l !== 'mul') : [];
  for (const b of bindings) {
    const qid = b.item?.value?.split('/').pop();
    const serviceLabel = b.itemLabel?.value?.trim();
    const naming = chooseName(labelsFromBinding(b), order, serviceLabel && serviceLabel !== qid ? serviceLabel : undefined);
    const name = naming?.name;
    const pos = parseWktPoint(b.coord?.value);
    if (!qid || !/^Q\d+$/.test(qid) || seen.has(qid) || !name || name === qid || !pos) continue;
    seen.add(qid);
    const signals = signalsFromBinding(b, options);
    const types = signals?.types ?? [];
    let kind = category;
    let type = b.type ? MUSEUM_TYPES[b.type.value.split('/').pop()] : MUSEUM_TYPES[types.find((t) => t in MUSEUM_TYPES)];
    if (category === 'notable') ({ category: kind, museumType: type } = notableCategory(types));
    const certification = kind === 'museum' ? 'referenced_museum' : signals?.designations.length || category === 'monument' ? 'protected_heritage' : null;
    places.push({
      id: `wikidata:${qid}`,
      name,
      ...(naming.names ? { names: naming.names } : {}),
      ...(naming.nameLang ? { nameLang: naming.nameLang } : {}),
      category: kind,
      lat: pos.lat,
      lon: pos.lon,
      source: 'wikidata',
      certified: certification !== null,
      ...(certification ? { certification } : {}),
      indoor: classifyIndoor({ category: kind, name, type }),
      url: `https://www.wikidata.org/wiki/${qid}`,
      wikidata: qid,
      ...(signals ? { signals } : {})
    });
  }
  return places;
}

/**
 * Éléments portant l'une des références données (ex. P380 = référence
 * Mérimée). Références limitées à des lettres et chiffres (aucune injection).
 * @param {string} property ex. "P380"
 * @param {string[]} refs
 */
export function buildReferenceQuery(property, refs) {
  const values = refs.filter((r) => /^[A-Za-z0-9]+$/.test(r)).map((r) => `"${r}"`).join(' ');
  return `SELECT ?item ?ref WHERE { VALUES ?ref { ${values} } ?item wdt:${property} ?ref . }`;
}

/**
 * Lignes { item, ref } -> { référence: "Q…" } (premier élément gardé si une
 * référence en a plusieurs).
 * @param {any[]} bindings
 * @returns {Record<string, string>}
 */
export function referenceBindingsToMap(bindings) {
  const map = {};
  for (const b of bindings) {
    const qid = b.item?.value?.split('/').pop();
    const ref = b.ref?.value;
    if (ref && qid && /^Q\d+$/.test(qid) && !(ref in map)) map[ref] = qid;
  }
  return map;
}

/**
 * Exécute une requête SPARQL. Exception à la règle HTTP globale : délai de
 * 15 s (rules.wikidata.timeoutSec) et un seul essai (aucune nouvelle tentative,
 * en particulier sur 429). En-tête Api-User-Agent en plus du User-Agent, que
 * Supabase complète de sa propre signature.
 * @param {string} query
 * @param {number} timeoutSec
 * @param {{ post?: boolean }} [options]
 * @returns {Promise<any[]>} lignes (results.bindings)
 */
export async function runSparql(query, timeoutSec, { post = false } = {}) {
  const headers = { Accept: 'application/sparql-results+json', 'Api-User-Agent': userAgent() };
  const common = { source: 'wikidata', timeoutMs: timeoutSec * 1000, maxAttempts: 1 };
  // POST pour les longues listes de valeurs (URL trop longue en GET).
  const res = post
    ? await fetchExternal(WIKIDATA_URL(), {
        ...common,
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ query }).toString()
      })
    : await fetchExternal(`${WIKIDATA_URL()}?${new URLSearchParams({ query })}`, { ...common, headers });
  try {
    return (await res.json()).results.bindings;
  } catch {
    throw new ExternalError('wikidata', res.status, false);
  }
}
