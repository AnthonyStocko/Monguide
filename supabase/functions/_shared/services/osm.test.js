import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RULES } from '../domain/config/rules.js';
import { ExternalError } from '../errors.js';
import { buildOverpassQuery, fetchOsmPlaces } from './osm.js';

const POINT = { lat: 45.99, lon: 4.73 };

describe('buildOverpassQuery', () => {
  it('fixe le délai serveur et limite chaque groupe (200 au total)', () => {
    const q = buildOverpassQuery(POINT, 20, RULES, { includeRestaurants: true });
    expect(q.startsWith('[out:json][timeout:8];')).toBe(true);
    const limits = [...q.matchAll(/out center tags qt (\d+);/g)].map((m) => Number(m[1]));
    expect(limits.reduce((a, b) => a + b, 0)).toBe(200);
  });

  it('interroge le rectangle du rayon demandé, réduit pour les restaurants (jamais around)', () => {
    const q = buildOverpassQuery(POINT, 20, RULES, { includeRestaurants: true });
    expect(q).not.toContain('around');
    const box = (tag) => q.match(new RegExp(`${tag}\\["name"\\]\\(([-\\d.]+),([-\\d.]+),([-\\d.]+),([-\\d.]+)\\)`)).slice(1).map(Number);
    const [s, w, n, e] = box('nw\\["amenity"="marketplace"\\]');
    expect(n - POINT.lat).toBeCloseTo(0.18, 2); // 20 km ≈ 0,18° de latitude
    expect(POINT.lat - s).toBeCloseTo(0.18, 2);
    expect(e - POINT.lon).toBeGreaterThan(0.25); // plus large en longitude à 46° N
    expect(POINT.lon - w).toBeCloseTo(e - POINT.lon, 5);
    const [fs, , fn] = box('nw\\["amenity"="restaurant"\\]');
    expect(fn - fs).toBeCloseTo((n - s) / 2, 3); // 10 km au lieu de 20
    for (const tag of ['"shop"="farm"', '"leisure"="park"', '"boundary"="protected_area"', '"tourism"="viewpoint"', '"amenity"="lavoir"', '"man_made"="lavoir"', 'wayside_cross|memorial|ruins']) {
      expect(q).toContain(tag);
    }
  });

  it('omet les restaurants quand le déjeuner se fait au marché', () => {
    const q = buildOverpassQuery(POINT, 20, RULES, { includeRestaurants: false });
    expect(q).not.toContain('restaurant');
  });
});

describe('fetchOsmPlaces', () => {
  let fetchMock;
  const options = { rules: RULES, lang: 'fr', includeRestaurants: true };
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

  it('envoie la requête en POST avec un délai de 8 s et convertit les éléments du rayon', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          elements: [
            { type: 'node', id: 1, lat: 45.99, lon: 4.72, tags: { amenity: 'restaurant', name: 'Le Bouchon' } },
            { type: 'node', id: 2, lat: 45.99, lon: 4.72, tags: { amenity: 'restaurant' } },
            // Coin du rectangle, hors du cercle de 20 km.
            { type: 'node', id: 3, lat: 46.16, lon: 4.98, tags: { tourism: 'viewpoint', name: 'Coin' } },
            // Restaurant à 15 km : hors du rayon réduit des restaurants (10 km).
            { type: 'node', id: 4, lat: 45.99, lon: 4.92, tags: { amenity: 'restaurant', name: 'Loin' } },
            { type: 'node', id: 5, lat: 45.99, lon: 4.92, tags: { tourism: 'viewpoint', name: 'Belvédère' } }
          ]
        })
      )
    );
    const places = await fetchOsmPlaces(POINT, 20, options);
    expect(places.map((p) => p.id)).toEqual(['osm:node/1', 'osm:node/5']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://overpass-api.de/api/interpreter');
    expect(init.method).toBe('POST');
    expect(new URLSearchParams(init.body).get('data')).toContain('[timeout:8]');
  });

  it.each([429, 504])('un %i ne déclenche aucune nouvelle requête', async (status) => {
    fetchMock.mockResolvedValue(new Response('busy', { status }));
    await expect(fetchOsmPlaces(POINT, 20, options)).rejects.toBeInstanceOf(ExternalError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('un délai dépassé ne déclenche aucune nouvelle requête', async () => {
    fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(fetchOsmPlaces(POINT, 20, options)).rejects.toMatchObject({ status: 502 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('traite une erreur d\'exécution Overpass (200 + remark) comme un échec', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ elements: [], remark: 'runtime error: Query timed out in "query" at line 3 after 8 seconds.' })));
    await expect(fetchOsmPlaces(POINT, 20, options)).rejects.toMatchObject({ upstreamStatus: 504 });
  });
});
