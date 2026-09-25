import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES } from '../../domain/config/rules.js';
import { heritage } from './heritage.js';

// Ces tests portent sur le mode Overpass (rules.osm.source), les tuiles sur osmTiles.test.js.
const OVERPASS_RULES = { ...RULES, osm: { ...RULES.osm, source: 'overpass' } };

const LISBON = { lat: 38.72, lon: -9.14 };
const sparql = (rows) => new Response(JSON.stringify({ results: { bindings: rows } }));
const row = (qid, label, lon, lat) => ({
  item: { value: `http://www.wikidata.org/entity/${qid}` },
  itemLabel: { value: label },
  coord: { value: `Point(${lon} ${lat})` }
});
const overpass = (elements) => new Response(JSON.stringify({ elements }));

describe('heritage (eu)', () => {
  let fetchMock;
  const ctx = () => ({ rules: OVERPASS_RULES, lang: 'fr', countryCode: 'PT', cache: { lookup: vi.fn(async () => undefined), set: vi.fn(async () => {}) } });
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

  const isWikidata = (url) => String(url).startsWith('https://query.wikidata.org/');

  it('interroge Wikidata en deux requêtes séparées, labels en français puis anglais puis portugais', async () => {
    fetchMock.mockImplementation(async (url) =>
      decodeURIComponent(String(url)).includes('P1435')
        ? sparql([row('Q1', 'Tour de Belém', -9.2159, 38.6916)])
        : sparql([row('Q2', 'Musée Calouste-Gulbenkian', -9.1545, 38.7372)])
    );
    const [monuments, museums] = await heritage(LISBON, 20, ctx());
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(monuments).toMatchObject({ name: 'monuments', status: 'ok', data: [{ id: 'wikidata:Q1', certification: 'protected_heritage' }] });
    expect(museums).toMatchObject({ name: 'museums', status: 'ok', data: [{ id: 'wikidata:Q2', certification: 'referenced_museum' }] });
    expect(monuments.query).toContain('wikibase:language "fr,en,pt,mul"');
    expect(typeof monuments.durationMs).toBe('number');
  });

  it('un 429 de Wikidata déclenche le repli OpenStreetMap, sans nouvelle requête vers Wikidata', async () => {
    fetchMock.mockImplementation(async (url) =>
      isWikidata(url)
        ? new Response('Too Many Requests', { status: 429 })
        : overpass([
            { type: 'way', id: 1, center: { lat: 38.6916, lon: -9.2159 }, tags: { heritage: '2', name: 'Torre de Belém', wikidata: 'Q1' } },
            { type: 'node', id: 2, lat: 38.7372, lon: -9.1545, tags: { tourism: 'museum', name: 'Museu Gulbenkian' } }
          ])
    );
    const [monuments, museums] = await heritage(LISBON, 20, ctx());
    const wikidataCalls = fetchMock.mock.calls.filter(([url]) => isWikidata(url));
    expect(wikidataCalls).toHaveLength(2); // une par requête, aucune relance
    expect(fetchMock.mock.calls.filter(([url]) => !isWikidata(url))).toHaveLength(1); // un seul appel Overpass
    expect(monuments).toMatchObject({ status: 'ok', message: 'fallback_osm', data: [{ id: 'osm:way/1', certified: true, wikidata: 'Q1' }] });
    expect(museums).toMatchObject({ status: 'ok', message: 'fallback_osm', data: [{ id: 'osm:node/2', category: 'museum', certified: false }] });
  });

  it('signale l\'échec si Wikidata et OpenStreetMap échouent', async () => {
    fetchMock.mockImplementation(async (url) => new Response('', { status: isWikidata(url) ? 429 : 406 }));
    const [monuments] = await heritage(LISBON, 20, ctx());
    expect(monuments).toMatchObject({ status: 'failed', message: 'upstream 429; fallback_osm_failed' });
  });
});
