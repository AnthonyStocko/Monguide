import { describe, expect, it } from 'vitest';
import { PLACE_CATEGORIES, SCHEMA_VERSION, isPlace } from './model.js';

const valid = {
  id: 'osm:node/1',
  name: 'Le Bouchon',
  category: 'restaurant',
  lat: 45.99,
  lon: 4.72,
  source: 'osm',
  certified: false,
  indoor: true,
  food: { cuisine: ['regional'], regional: true, wheelchair: 'yes' }
};

describe('model', () => {
  it('expose la version du schéma et les catégories', () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(PLACE_CATEGORIES).toContain('museum');
    expect(Object.isFrozen(PLACE_CATEGORIES)).toBe(true);
  });
});

describe('isPlace', () => {
  it('accepte un lieu complet et un lieu minimal', () => {
    expect(isPlace(valid)).toBe(true);
    const { food, ...minimal } = valid;
    expect(isPlace({ ...minimal, indoor: null })).toBe(true);
    expect(isPlace({ ...minimal, certified: true, certification: 'protected_heritage', wikidata: 'Q1492' })).toBe(true);
  });

  it.each([
    ['sans id', { id: '' }],
    ['sans nom', { name: '  ' }],
    ['catégorie inconnue', { category: 'bar' }],
    ['latitude hors bornes', { lat: 91 }],
    ['longitude non numérique', { lon: '4.7' }],
    ['certified non booléen', { certified: 'yes' }],
    ['indoor indéfini', { indoor: undefined }],
    ['food sans regional', { food: { cuisine: [] } }],
    ['wheelchair invalide', { food: { regional: false, wheelchair: 'partial' } }],
    ['cuisine non tableau', { food: { regional: false, cuisine: 'pizza' } }],
    ['certification inconnue', { certification: 'unesco' }],
    ['identifiant Wikidata invalide', { wikidata: 'P31' }]
  ])('refuse un lieu %s', (_, patch) => {
    expect(isPlace({ ...valid, ...patch })).toBe(false);
  });

  it('refuse une valeur non objet', () => {
    expect(isPlace(null)).toBe(false);
    expect(isPlace('place')).toBe(false);
  });
});
