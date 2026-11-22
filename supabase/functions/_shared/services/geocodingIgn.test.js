import { describe, expect, it } from 'vitest';
import { ignToAddress, ignToResult, regionFromContext } from './geocodingIgn.js';

const feature = (props, coords = [-0.363, 49.181]) => ({ properties: props, geometry: { coordinates: coords } });

describe('regionFromContext', () => {
  it('prend le département', () => {
    expect(regionFromContext('14, Calvados, Normandie')).toBe('Calvados');
    expect(regionFromContext('974, La Réunion')).toBe('La Réunion');
    expect(regionFromContext('75')).toBeUndefined();
    expect(regionFromContext(undefined)).toBeUndefined();
  });
});

describe('ignToResult', () => {
  it('normalise une commune', () => {
    expect(ignToResult(feature({ type: 'municipality', name: 'Caen', city: 'Caen', context: '14, Calvados, Normandie' }), 'en')).toEqual({
      name: 'Caen',
      region: 'Calvados',
      country: 'France',
      countryCode: 'FR',
      lat: 49.181,
      lon: -0.363
    });
  });

  it("écarte ce qui n'est pas une commune ou sans position", () => {
    expect(ignToResult(feature({ type: 'street', name: 'Rue de Caen' }))).toBeNull();
    expect(ignToResult({ properties: { type: 'municipality', name: 'Caen' } })).toBeNull();
    expect(ignToResult({})).toBeNull();
  });
});

describe('ignToAddress', () => {
  it('formate un numéro et une rue', () => {
    expect(ignToAddress(feature({ type: 'housenumber', housenumber: '12', street: 'Rue Royale', postcode: '74000', city: 'Annecy' }, [6.12, 45.9]))).toEqual({
      address: '12 Rue Royale, 74000 Annecy',
      countryCode: 'FR',
      lat: 45.9,
      lon: 6.12
    });
    expect(ignToAddress(feature({ type: 'street', name: 'Rue Royale', city: 'Annecy' }))).toMatchObject({ address: 'Rue Royale, Annecy' });
  });

  it('écarte une commune seule', () => {
    expect(ignToAddress(feature({ type: 'municipality', name: 'Annecy' }))).toBeNull();
  });
});
