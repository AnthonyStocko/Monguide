import { describe, expect, it } from 'vitest';
import { PLACE_CATEGORIES, SCHEMA_VERSION, isPlace, isPlaceImage } from './model.js';

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
    expect(SCHEMA_VERSION).toBe(2);
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

  it('accepte names (facultatif) : variantes du nom par langue', () => {
    expect(isPlace({ ...valid, name: 'Grand-Place - Grote Markt', names: { fr: 'Grand-Place', nl: 'Grote Markt' } })).toBe(true);
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
    ['identifiant Wikidata invalide', { wikidata: 'P31' }],
    ['names non objet', { names: 'Grand-Place' }],
    ['names tableau', { names: ['Grand-Place'] }],
    ['variante de nom vide', { names: { fr: ' ' } }]
  ])('refuse un lieu %s', (_, patch) => {
    expect(isPlace({ ...valid, ...patch })).toBe(false);
  });

  it('refuse une valeur non objet', () => {
    expect(isPlace(null)).toBe(false);
    expect(isPlace('place')).toBe(false);
  });
});

describe('isPlaceImage', () => {
  const image = {
    thumbUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/38/X.jpg/500px-X.jpg',
    width: 500,
    height: 666,
    credit: { author: 'A. Harassek', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0', sourceUrl: 'https://commons.wikimedia.org/wiki/File:X.jpg' }
  };

  it('accepte une photo complète, et une photo du domaine public sans auteur ni lien de licence', () => {
    expect(isPlaceImage(image)).toBe(true);
    expect(isPlaceImage({ ...image, credit: { license: 'Public domain', sourceUrl: image.credit.sourceUrl } })).toBe(true);
  });

  it.each([
    ['sans crédit', { credit: undefined }],
    ['sans licence', { credit: { ...image.credit, license: '' } }],
    ['sans page source', { credit: { ...image.credit, sourceUrl: undefined } }],
    ['autre domaine', { thumbUrl: 'https://example.org/x.jpg' }],
    ['dimensions nulles', { width: 0 }]
  ])('refuse une photo %s', (_label, patch) => {
    expect(isPlaceImage({ ...image, ...patch })).toBe(false);
  });

  it('Place.image est facultatif, mais vérifié s’il est présent', () => {
    expect(isPlace({ ...valid, image })).toBe(true);
    expect(isPlace({ ...valid, image: { ...image, credit: undefined } })).toBe(false);
  });
});
