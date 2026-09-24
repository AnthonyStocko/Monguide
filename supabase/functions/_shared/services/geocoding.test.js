import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { photonToAddress, photonToResult, reverseAddress, reverseCity, searchAddresses, searchCities } from './geocoding.js';

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
      lon: 4.726611
    });
  });

  it("garde les communes de tous les pays (le filtrage est fait par l'application)", () => {
    expect(photonToResult(feature({ name: 'Istanbul', countrycode: 'tr', country: 'Turquie' }))).toMatchObject({ countryCode: 'TR' });
  });

  it("écarte un résultat qui n'est pas une commune, sans nom ou sans pays", () => {
    expect(photonToResult(feature({ name: 'X', countrycode: undefined }))).toBeNull();
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
      feature({ name: 'Rue Villefranche', type: 'street' }),
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

describe('adresses', () => {
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

  const house = (props, coords = [6.1241586, 45.900347]) => ({
    properties: { type: 'house', countrycode: 'FR', housenumber: '12', street: 'Rue Royale', postcode: '74000', city: 'Annecy', ...props },
    geometry: { coordinates: coords }
  });

  it('formate une adresse et garde le nom d\'un lieu', () => {
    expect(photonToAddress(house({}))).toEqual({ address: '12 Rue Royale, 74000 Annecy', countryCode: 'FR', lat: 45.900347, lon: 6.1241586 });
    expect(photonToAddress(house({ name: 'Hôtel du Parc' }))).toMatchObject({ name: 'Hôtel du Parc', address: '12 Rue Royale, 74000 Annecy' });
    expect(photonToAddress({ properties: { type: 'street', name: 'Rue Royale', city: 'Annecy', countrycode: 'fr' }, geometry: { coordinates: [6.12, 45.9] } })).toEqual({
      address: 'Rue Royale, Annecy',
      countryCode: 'FR',
      lat: 45.9,
      lon: 6.12
    });
    expect(photonToAddress({ properties: { countrycode: 'FR' }, geometry: { coordinates: [1, 2] } })).toBeNull();
  });

  it('cherche maisons et rues, près de la destination', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ features: [house({}), house({})] })));
    const results = await searchAddresses('12 rue Royale', 'fr', 5, { lat: 45.9, lon: 6.1 });
    expect(results).toHaveLength(1);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.searchParams.getAll('layer')).toEqual(['house', 'street']);
    expect(url.searchParams.get('lat')).toBe('45.9');
  });

  it('trouve l\'adresse d\'une position', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ features: [house({})] })));
    expect(await reverseAddress({ lat: 45.9, lon: 6.12 }, 'fr')).toHaveLength(1);
    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/reverse');
  });
});
