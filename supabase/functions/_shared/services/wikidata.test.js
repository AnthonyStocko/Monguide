import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPlace } from '../domain/model.js';
import {
  articleLanguages,
  bindingsToPlaces,
  buildMonumentsQuery,
  buildMuseumsQuery,
  buildNotableQuery,
  buildReferenceQuery,
  buildSignalsQuery,
  chooseName,
  labelLanguages,
  labelsFromBinding,
  nameLanguages,
  notableCategory,
  parseWktPoint,
  referenceBindingsToMap,
  runSparql,
  signalsFromBinding
} from './wikidata.js';

const BARCELONA = { lat: 41.39, lon: 2.17 };
const LANGS = labelLanguages('fr', ['es', 'ca']);

describe('requêtes SPARQL', () => {
  it('ordonne les langues : interface, anglais, langues locales, mul', () => {
    expect(LANGS).toEqual(['fr', 'en', 'es', 'ca', 'mul']);
    expect(labelLanguages('en', ['en', 'ga'])).toEqual(['en', 'ga', 'mul']);
  });

  it.each([
    ['monuments', buildMonumentsQuery(BARCELONA, 20, LANGS, 300)],
    ['musées', buildMuseumsQuery(BARCELONA, 20, LANGS, 300)]
  ])('%s : wikibase:around en premier, LIMIT 300, jamais wdt:P279*', (_, q) => {
    // Sous-requête la plus intérieure : celle qui choisit les éléments avant le LIMIT.
    const inner = q.slice(q.indexOf('SELECT DISTINCT'));
    const where = inner.slice(inner.indexOf('WHERE {') + 'WHERE {'.length).trim();
    expect(where.startsWith('SERVICE wikibase:around')).toBe(true);
    expect(q).toContain('wikibase:center "Point(2.17 41.39)"^^geo:wktLiteral');
    expect(q).toContain('wikibase:radius "20"');
    expect(q).toContain('LIMIT 300');
    expect(q).not.toContain('P279');
    expect(q).toContain('wikibase:language "fr,en,es,ca,mul"');
  });

  it('monuments : les plus proches d’abord (tri par distance avant le LIMIT) ; musées sans tri', () => {
    const monuments = buildMonumentsQuery(BARCELONA, 20, LANGS, 300);
    expect(monuments).toContain('wikibase:distance ?dist');
    expect(monuments).toMatch(/\} ORDER BY \?dist LIMIT 300 \}/);
    const museums = buildMuseumsQuery(BARCELONA, 20, LANGS, 300);
    expect(museums).not.toContain('?dist');
    expect(museums).not.toContain('ORDER BY');
  });

  it('sépare monuments (P1435) et musées (liste fermée de types)', () => {
    const inner = (q) => q.slice(q.indexOf('SELECT DISTINCT'), q.indexOf('LIMIT 300'));
    const monuments = inner(buildMonumentsQuery(BARCELONA, 20, LANGS, 300));
    const museums = inner(buildMuseumsQuery(BARCELONA, 20, LANGS, 300));
    expect(monuments).toContain('wdt:P1435');
    expect(monuments).not.toContain('P31');
    expect(museums).toContain('VALUES ?museumType { wd:Q33506 ');
    expect(museums).toContain('?item wdt:P31 ?museumType');
    expect(museums).not.toContain('P1435');
  });

  it('signaux de notoriété agrégés par élément après le LIMIT, sur les seuls éléments retenus', () => {
    const q = buildMonumentsQuery(BARCELONA, 20, LANGS, 300, ['fr', 'es', 'ca']);
    const afterLimit = q.slice(q.indexOf('LIMIT 300'));
    expect(afterLimit).toContain('?item wikibase:sitelinks ?n');
    expect(afterLimit).toContain('?item wdt:P31 ?type');
    expect(afterLimit).toContain('?item wdt:P1435 ?designation');
    expect(afterLimit).toContain('?item wdt:P361 ?part');
    expect(afterLimit).toContain('FILTER(?wiki IN (<https://fr.wikipedia.org/>, <https://es.wikipedia.org/>, <https://ca.wikipedia.org/>))');
    expect(afterLimit).not.toContain('VALUES ?wiki');
    expect(afterLimit).toContain('GROUP BY ?item');
    expect(q.indexOf('wikibase:label')).toBeGreaterThan(q.indexOf('GROUP BY ?item'));
    expect(articleLanguages('fr', ['es', 'ca', 'fr'])).toEqual(['fr', 'es', 'ca']);
  });

  it('lieux connus : articles minimum, les plus connus d’abord, ni communes, ni organisations', () => {
    const q = buildNotableQuery(BARCELONA, 10, LANGS, { minSitelinks: 5, limit: 150 }, ['fr']);
    const inner = q.slice(q.indexOf('{ SELECT ?item ?c ?links'));
    expect(inner.slice(inner.indexOf('WHERE {') + 7).trim().startsWith('SERVICE wikibase:around')).toBe(true);
    expect(q).toContain('FILTER(?links >= 5)');
    expect(q).toContain('FILTER NOT EXISTS { ?item wdt:P1082 [] . }');
    expect(q).toContain('?item wdt:P1435|wdt:P84|wdt:P149|wdt:P170 [] .');
    expect(q).toContain('wd:Q33506');
    expect(q).toContain('wd:Q22698');
    expect(q).toContain('wd:Q570116');
    expect(q).toMatch(/ORDER BY DESC\(\?links\) \?item LIMIT 150/);
    expect(q).not.toContain('P279');
  });

  it('signaux d’éléments connus par leur identifiant : une ligne par élément, sans injection', () => {
    const q = buildSignalsQuery(['Q1', 'Q22', 'x} DROP'], ['fr']);
    expect(q).toContain('VALUES ?item { wd:Q1 wd:Q22 }');
    expect(q).toContain('GROUP BY ?item');
    expect(q).not.toContain('DROP');
  });
});

describe('bindingsToPlaces', () => {
  const b = (qid, label, coord, type) => ({
    item: { value: `http://www.wikidata.org/entity/${qid}` },
    itemLabel: { value: label },
    coord: { value: coord },
    ...(type ? { type: { value: `http://www.wikidata.org/entity/${type}` } } : {})
  });

  it('produit des Places certifiés, un par élément, sans les éléments sans nom', () => {
    const places = bindingsToPlaces(
      [
        b('Q1492', 'Basilique de la Sagrada Família', 'Point(2.1744 41.4036)'),
        b('Q1492', 'Basilique de la Sagrada Família', 'Point(2.1745 41.4037)'),
        b('Q999', 'Q999', 'Point(2 41)'),
        b('Q5', 'Sans position', 'invalide')
      ],
      'monument'
    );
    expect(places).toEqual([
      {
        id: 'wikidata:Q1492',
        name: 'Basilique de la Sagrada Família',
        category: 'monument',
        lat: 41.4036,
        lon: 2.1744,
        source: 'wikidata',
        certified: true,
        certification: 'protected_heritage',
        indoor: true,
        url: 'https://www.wikidata.org/wiki/Q1492',
        wikidata: 'Q1492'
      }
    ]);
    expect(isPlace(places[0])).toBe(true);
  });

  it('classe un musée de plein air en extérieur grâce à son type', () => {
    const [museum] = bindingsToPlaces([b('Q7', 'Poble Espanyol', 'Point(2.14 41.37)', 'Q756102')], 'museum');
    expect(museum).toMatchObject({ category: 'museum', certification: 'referenced_museum', indoor: false });
  });

  const entity = (q) => `http://www.wikidata.org/entity/${q}`;
  const withSignals = (row, { sitelinks, types = [], designations = [], parts = [], wikis = [] }) => ({
    ...row,
    sitelinks: { value: String(sitelinks) },
    types: { value: types.map(entity).join(' ') },
    designations: { value: designations.map(entity).join(' ') },
    parts: { value: parts.map(entity).join(' ') },
    wikis: { value: wikis.map((l) => `https://${l}.wikipedia.org/`).join(' ') }
  });

  it('garde les signaux de notoriété : articles, natures, désignations, ensembles, articles fr et locaux', () => {
    const row = withSignals(b('Q215429', 'Grand-Place', 'Point(4.3524 50.8467)'), { sitelinks: 56, types: ['Q26987258'], designations: ['Q9259', 'Q19346745'], wikis: ['fr', 'nl'] });
    const [place] = bindingsToPlaces([row], 'monument', { lang: 'fr', localLanguages: ['nl', 'fr', 'de'] });
    expect(place.signals).toEqual({ sitelinks: 56, types: ['Q26987258'], designations: ['Q9259', 'Q19346745'], partOf: [], langArticle: true, localArticle: true });
    expect(signalsFromBinding(b('Q1', 'Sans signaux', 'Point(1 2)'))).toBeNull();
  });

  it('lieux connus : catégorie d’après la nature, certifié seulement avec une désignation ou un type de musée', () => {
    const rows = [
      withSignals(b('Q1865794', 'Mont des Arts', 'Point(4.356 50.844)'), { sitelinks: 14, types: ['Q2026833'] }),
      withSignals(b('Q2', 'Musée', 'Point(4.35 50.84)'), { sitelinks: 30, types: ['Q207694'] }),
      withSignals(b('Q3', 'Atomium', 'Point(4.34 50.89)'), { sitelinks: 53, types: ['Q570116'] }),
      withSignals(b('Q4', 'Cathédrale', 'Point(4.36 50.848)'), { sitelinks: 36, types: ['Q2977'], designations: ['Q19346745'] })
    ];
    const places = bindingsToPlaces(rows, 'notable', { lang: 'fr', localLanguages: ['nl'] });
    expect(places.map((p) => [p.name, p.category, p.certified, p.certification ?? null])).toEqual([
      ['Mont des Arts', 'park', false, null],
      ['Musée', 'museum', true, 'referenced_museum'],
      ['Atomium', 'monument', false, null],
      ['Cathédrale', 'monument', true, 'protected_heritage']
    ]);
    expect(places.every(isPlace)).toBe(true);
    expect(notableCategory([])).toEqual({ category: 'monument' });
  });

  it('lit les coordonnées WKT', () => {
    expect(parseWktPoint('Point(-9.14 38.72)')).toEqual({ lat: 38.72, lon: -9.14 });
    expect(parseWktPoint('POINT(1 2)')).toBeNull();
  });
});

describe('runSparql', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('envoie la requête avec Api-User-Agent, un délai de 15 s et renvoie les lignes', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ results: { bindings: [{ a: 1 }] } })));
    expect(await runSparql('SELECT 1', 15)).toEqual([{ a: 1 }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url.startsWith('https://query.wikidata.org/sparql?query=')).toBe(true);
    expect(init.headers['Api-User-Agent']).toMatch(/^MonGuide\//);
    expect(init.headers.Accept).toBe('application/sparql-results+json');
  });

  it('en POST pour les longues listes : requête dans le corps', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ results: { bindings: [] } })));
    await runSparql('SELECT 2', 6, { post: true });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://query.wikidata.org/sparql');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    expect(new URLSearchParams(init.body).get('query')).toBe('SELECT 2');
  });

  it('un 429 ne déclenche aucune nouvelle requête', async () => {
    fetchMock.mockResolvedValue(new Response('slow down', { status: 429 }));
    await expect(runSparql('SELECT 1', 15)).rejects.toMatchObject({ upstreamStatus: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un 5xx ou un délai dépassé ne déclenche pas non plus de nouvelle requête', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 503 }));
    await expect(runSparql('SELECT 1', 15)).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('références (Mérimée, Muséofile)', () => {
  it('requête VALUES sur la propriété, références nettoyées', () => {
    const q = buildReferenceQuery('P380', ['PA00118090', 'PA0011"} DELETE', 'M1041']);
    expect(q).toBe('SELECT ?item ?ref WHERE { VALUES ?ref { "PA00118090" "M1041" } ?item wdt:P380 ?ref . }');
  });

  it('référence -> Q…, premier élément gardé', () => {
    const b = (q, ref) => ({ item: { value: `http://www.wikidata.org/entity/${q}` }, ref: { value: ref } });
    expect(referenceBindingsToMap([b('Q2983916', 'PA00118090'), b('Q5', 'PA00118090'), b('Q16335746', 'M1041')])).toEqual({
      PA00118090: 'Q2983916',
      M1041: 'Q16335746'
    });
  });
});

describe('libellés et fermetures (Phase B)', () => {
  const row = (qid, labels, extra = {}) => ({
    item: { value: `http://www.wikidata.org/entity/${qid}` },
    itemLabel: { value: Object.values(labels)[0] ?? qid },
    coord: { value: 'Point(4.35 50.85)' },
    sitelinks: { value: '3' },
    labels: { value: Object.entries(labels).map(([l, t]) => `${l}:${t}`).join('\t') },
    ...extra
  });
  const BXL = { lang: 'fr', localLanguages: ['nl', 'fr', 'de'] };

  it('un lieu avec seulement un libellé néerlandais reçoit le libellé anglais s’il existe', () => {
    const [p] = bindingsToPlaces([row('Q1', { nl: 'Koninklijk Museum', en: 'Royal Museum' })], 'museum', BXL);
    expect(p).toMatchObject({ name: 'Royal Museum', nameLang: 'en', names: { nl: 'Koninklijk Museum' } });
  });

  it('ordre des libellés : interface, anglais, langues du pays ; variantes gardées dans names', () => {
    const [p] = bindingsToPlaces([row('Q215429', { nl: 'Grote Markt', fr: 'Grand-Place', en: 'Grand Place' })], 'monument', BXL);
    expect(p).toMatchObject({ name: 'Grand-Place', nameLang: 'fr', names: { en: 'Grand Place', nl: 'Grote Markt' } });
    expect(chooseName({ de: 'Rathaus' }, ['fr', 'en', 'nl', 'de'], undefined)).toEqual({ name: 'Rathaus', nameLang: 'de' });
    expect(chooseName({}, ['fr', 'en'], 'Atomium')).toEqual({ name: 'Atomium' });
    expect(labelsFromBinding({ labels: { value: 'fr:Rue: la suite\ten:Street' } })).toEqual({ fr: 'Rue: la suite', en: 'Street' });
  });

  it('requêtes : libellés de toutes les langues utiles, fermetures, états d’usage, redirections', () => {
    const q = buildMonumentsQuery(BARCELONA, 20, LANGS, 300, ['fr'], nameLanguages('fr', ['es', 'ca']));
    expect(nameLanguages('en', ['es', 'ca'])).toEqual(['fr', 'en', 'es', 'ca']);
    expect(q).toContain('FILTER(LANG(?label) IN ("fr", "en", "es", "ca"))');
    expect(q).toContain('?item wdt:P3999|wdt:P576 ?closure');
    expect(q).toContain('?item wdt:P5817 ?state');
    expect(q).toContain('FILTER(?redirectBadge IN (wd:Q70893996, wd:Q70894304))');
    expect(q).toContain('FILTER NOT EXISTS { ?article wikibase:badge ?articleBadge');
    expect(buildSignalsQuery(['Q1'], ['fr'])).toContain('?redirects');
  });

  it('signaux de fermeture lus', () => {
    const s = signalsFromBinding({ sitelinks: { value: '2' }, redirects: { value: '1' }, closures: { value: '2011-01-31T00:00:00Z' }, states: { value: 'http://www.wikidata.org/entity/Q104664889' } });
    expect(s).toMatchObject({ sitelinks: 2, redirects: 1, closures: ['2011-01-31T00:00:00Z'], states: ['Q104664889'] });
  });
});
