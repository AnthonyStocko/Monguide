import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { photonToResult, reverseCity, searchCities } from './geocoding.js';

const feature = (props, coords = [4.726611, 45.9864749]) => ({
  type: 'Feature',
  properties: { type: 'city', countrycode: 'FR', country: 'France', county: 'Rhône', state: 'Auvergne-Rhône-Alpes', ...props },
  geometry: { type: 'Point', coordinates: coords }
});

describe('photonToResult', () => {
  it('normalise une commune française', () => {
    expect(photonToResult(feature({ name: 'Villefranche-sur-Saône' }))).toEqual({
      name: 'Villefranche-sur-Saône',
      region: 'Rhône',
      country: 'France',
      countryCode: 'FR',
      lat: 45.9864749,
      lon: 4.726611,
      timezone: 'Europe/Paris'
    });
  });

  it('écarte un pays non pris en charge, un résultat qui n\'est pas une commune ou sans nom', () => {
    expect(photonToResult(feature({ name: 'Genève', countrycode: 'CH' }))).toBeNull();
    expect(photonToResult(feature({ name: 'Rue de la Paix', type: 'street' }))).toBeNull();
    expect(photonToResult(feature({ name: undefined }))).toBeNull();
    expect(photonToResult({})).toBeNull();
  });
});

describe('searchCities / reverseCity', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const respond = (features) => fetchMock.mockResolvedValue(new Response(JSON.stringify({ features })));

  it('interroge Photon (villes uniquement, langue) et limite, filtre et dédoublonne', async () => {
    respond([
      feature({ name: 'Villefranche-sur-Saône' }),
      feature({ name: 'Villefranche-sur-Saône' }),
      feature({ name: 'Villefranche', countrycode: 'CH' }),
      feature({ name: 'Villefranche-de-Rouergue', county: 'Aveyron' })
    ]);
    const results = await searchCities('Villefranche', 'fr', 10);
    expect(results.map((r) => r.name)).toEqual(['Villefranche-sur-Saône', 'Villefranche-de-Rouergue']);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://photon.komoot.io/api/');
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: 'Villefranche', limit: '20', lang: 'fr', layer: 'city' });
  });

  it('utilise la recherche inverse de Photon', async () => {
    respond([feature({ name: 'Villefranche-sur-Saône' })]);
    const results = await reverseCity({ lat: 45.99, lon: 4.72 }, 'en');
    expect(results).toHaveLength(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/reverse');
    expect(url.searchParams.get('lang')).toBe('en');
    expect(url.searchParams.get('layer')).toBe('city');
  });
});
