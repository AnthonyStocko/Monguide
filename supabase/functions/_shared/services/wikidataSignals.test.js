import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES } from '../domain/config/rules.js';
import { addSignals, digest } from './wikidataSignals.js';

const entity = (q) => `http://www.wikidata.org/entity/${q}`;
const binding = (qid, labels) => ({
  item: { value: entity(qid) },
  sitelinks: { value: '12' },
  types: { value: entity('Q330284') },
  labels: { value: Object.entries(labels).map(([l, t]) => `${l}:${t}`).join('\t') }
});

describe('addSignals', () => {
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
  const ctx = { rules: RULES, lang: 'fr', countryCode: 'ES', cache: { lookup: async () => undefined, set: async () => {} } };

  it('signaux Wikidata, et libellés français et anglais ajoutés aux variantes d’un lieu OSM qui n’en a pas', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ results: { bindings: [binding('Q1', { fr: 'Marché de Sant Antoni', en: 'Sant Antoni Marketplace' }), binding('Q2', { fr: 'Halles', en: 'Market Hall' })] } }))
    );
    const places = [
      { id: 'osm:way/1', name: 'Mercat de Sant Antoni', category: 'market', lat: 41.37, lon: 2.16, source: 'osm', certified: false, indoor: true, wikidata: 'Q1' },
      { id: 'osm:way/2', name: 'Mercat', names: { fr: 'Marché couvert' }, category: 'market', lat: 41.38, lon: 2.17, source: 'osm', certified: false, indoor: true, wikidata: 'Q2' }
    ];
    const [a, b] = await addSignals(places, { lat: 41.38, lon: 2.17 }, 10, ctx);
    expect(a.signals).toMatchObject({ sitelinks: 12, types: ['Q330284'] });
    expect(a.signals.labels).toBeUndefined();
    expect(a.names).toEqual({ fr: 'Marché de Sant Antoni', en: 'Sant Antoni Marketplace' });
    // Variante OSM existante gardée.
    expect(b.names).toEqual({ fr: 'Marché couvert', en: 'Market Hall' });
    const query = new URLSearchParams(fetchMock.mock.calls[0][1].body).get('query');
    expect(query).toContain('FILTER(LANG(?label) IN ("fr", "en"))');
  });

  it('échec de Wikidata : lieux inchangés, sans erreur', async () => {
    fetchMock.mockResolvedValue(new Response('busy', { status: 503 }));
    const place = { id: 'osm:node/3', name: 'X', category: 'park', lat: 1, lon: 2, source: 'osm', certified: false, indoor: false, wikidata: 'Q3' };
    expect(await addSignals([place], { lat: 1, lon: 2 }, 10, ctx)).toEqual([place]);
    expect(digest(['Q1', 'Q2'])).toMatch(/^[0-9a-f]{8}$/);
  });
});
