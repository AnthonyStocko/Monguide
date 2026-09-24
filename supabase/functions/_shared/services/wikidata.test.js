import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isPlace } from '../domain/model.js';
import { bindingsToPlaces, buildMonumentsQuery, buildMuseumsQuery, labelLanguages, parseWktPoint, runSparql } from './wikidata.js';

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
    const where = q.slice(q.indexOf('WHERE {', q.indexOf('SELECT', 1)) + 'WHERE {'.length).trim();
    expect(where.startsWith('SERVICE wikibase:around')).toBe(true);
    expect(q).toContain('wikibase:center "Point(2.17 41.39)"^^geo:wktLiteral');
    expect(q).toContain('wikibase:radius "20"');
    expect(q).toContain('LIMIT 300');
    expect(q).not.toContain('P279');
    expect(q).toContain('wikibase:language "fr,en,es,ca,mul"');
  });

  it('sépare monuments (P1435) et musées (liste fermée de types)', () => {
    const monuments = buildMonumentsQuery(BARCELONA, 20, LANGS, 300);
    const museums = buildMuseumsQuery(BARCELONA, 20, LANGS, 300);
    expect(monuments).toContain('wdt:P1435');
    expect(monuments).not.toContain('P31');
    expect(museums).toContain('VALUES ?type { wd:Q33506 ');
    expect(museums).toContain('?item wdt:P31 ?type');
    expect(museums).not.toContain('P1435');
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
