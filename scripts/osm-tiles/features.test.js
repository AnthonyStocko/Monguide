import { describe, expect, it } from 'vitest';
import { classify, compareEntries, featureToEntry, osmId, pickTags } from './features.js';

const FR = { heritageFallback: false };
const EU = { heritageFallback: true };
const point = (lon, lat) => ({ type: 'Point', coordinates: [lon, lat] });

describe('osmId', () => {
  it('garde les identifiants n, w et r', () => {
    expect(osmId('n123')).toBe('n123');
    expect(osmId('w456')).toBe('w456');
    expect(osmId('r789')).toBe('r789');
  });

  it('ramène un identifiant de surface à son objet d’origine', () => {
    expect(osmId('a912')).toBe('w456');
    expect(osmId('a1579')).toBe('r789');
  });

  it('refuse un identifiant inconnu', () => {
    expect(osmId('x1')).toBeNull();
    expect(osmId(undefined)).toBeNull();
  });
});

describe('classify', () => {
  it('suit osmCategory, avec covered_market pour un marché couvert', () => {
    expect(classify({ amenity: 'restaurant' }, FR)).toEqual({ category: 'restaurant', subcategory: 'restaurant' });
    expect(classify({ amenity: 'marketplace', covered: 'yes' }, FR)).toEqual({ category: 'market', subcategory: 'covered_market' });
    expect(classify({ amenity: 'marketplace' }, FR)).toEqual({ category: 'market', subcategory: 'marketplace' });
    expect(classify({ man_made: 'lavoir' }, FR)).toEqual({ category: 'small_heritage', subcategory: 'lavoir' });
    expect(classify({ boundary: 'protected_area' }, FR)).toEqual({ category: 'nature', subcategory: 'protected_area' });
    expect(classify({ shop: 'bakery' }, FR)).toBeNull();
  });

  it('ne classe musées et monuments qu’avec le repli du patrimoine', () => {
    expect(classify({ tourism: 'museum' }, FR)).toBeNull();
    expect(classify({ heritage: '2', historic: 'castle' }, FR)).toBeNull();
    expect(classify({ tourism: 'museum' }, EU)).toEqual({ category: 'museum', subcategory: 'museum' });
    expect(classify({ heritage: '2', historic: 'castle' }, EU)).toEqual({ category: 'monument', subcategory: 'castle' });
    expect(classify({ heritage: '1', building: 'church' }, EU)).toEqual({ category: 'monument', subcategory: 'church' });
    expect(classify({ heritage: '1' }, EU)).toEqual({ category: 'monument', subcategory: 'monument' });
    expect(classify({ heritage: '3', amenity: 'restaurant' }, EU).category).toBe('restaurant');
  });
});

describe('pickTags', () => {
  it('ne garde que les tags utiles présents, dans un ordre fixe', () => {
    const tags = { website: 'https://a.fr', amenity: 'restaurant', cuisine: 'french', name: 'A', source: 'survey', 'diet:vegan': 'yes' };
    expect(Object.keys(pickTags(tags))).toEqual(['cuisine', 'diet:vegan', 'website']);
  });

  it('ramène contact:phone et contact:website, la valeur directe l’emportant', () => {
    expect(pickTags({ 'contact:phone': '+33 1', 'contact:website': 'https://c.fr' })).toEqual({ phone: '+33 1', website: 'https://c.fr' });
    expect(pickTags({ phone: '+33 2', 'contact:phone': '+33 1' })).toEqual({ phone: '+33 2' });
  });

  it('garde name:fr et name:en seulement s’ils diffèrent de name', () => {
    expect(pickTags({ name: 'Köln Dom', 'name:fr': 'Cathédrale de Cologne', 'name:en': 'Köln Dom' })).toEqual({ 'name:fr': 'Cathédrale de Cologne' });
  });
});

describe('featureToEntry', () => {
  it('produit [id, category, subcategory, name, lat, lon, tags], coordonnées à 5 décimales', () => {
    const f = { id: 'n4960151502', geometry: point(4.395094, 45.0102349), properties: { amenity: 'restaurant', name: 'Le Verdun', cuisine: 'french' } };
    expect(featureToEntry(f, FR)).toEqual(['n4960151502', 'restaurant', 'restaurant', 'Le Verdun', 45.01023, 4.39509, { cuisine: 'french' }]);
  });

  it('exclut les objets sans nom, sauf petit patrimoine et points de vue', () => {
    expect(featureToEntry({ id: 'n1', geometry: point(4, 45), properties: { amenity: 'restaurant' } }, FR)).toBeNull();
    expect(featureToEntry({ id: 'w2', geometry: point(4, 45), properties: { leisure: 'park' } }, FR)).toBeNull();
    expect(featureToEntry({ id: 'n3', geometry: point(4, 45), properties: { historic: 'wayside_cross' } }, FR)).toEqual([
      'n3',
      'small_heritage',
      'wayside_cross',
      null,
      45,
      4,
      {}
    ]);
    expect(featureToEntry({ id: 'n4', geometry: point(4, 45), properties: { tourism: 'viewpoint' } }, FR)[1]).toBe('viewpoint');
  });

  it('accepte un objet nommé seulement en français', () => {
    const e = featureToEntry({ id: 'n5', geometry: point(4, 45), properties: { amenity: 'restaurant', 'name:fr': 'Chez A' } }, FR);
    expect(e[3]).toBeNull();
    expect(e[6]).toEqual({ 'name:fr': 'Chez A' });
  });

  it('réduit une surface à un point intérieur', () => {
    const ring = [
      [0, 0],
      [3, 0],
      [3, 3],
      [2, 3],
      [2, 1],
      [1, 1],
      [1, 3],
      [0, 3],
      [0, 0]
    ];
    const e = featureToEntry({ id: 'w7', geometry: { type: 'Polygon', coordinates: [ring] }, properties: { leisure: 'park', name: 'Parc en U' } }, FR);
    expect([e[5], e[4]]).toEqual([0.5, 2]); // dans le bras gauche du U, pas au centre (1,5 ; 1,5), qui est dehors
  });
});

describe('compareEntries', () => {
  it('trie par type puis identifiant numérique', () => {
    const ids = ['w5', 'n10', 'r1', 'n9'].map((id) => [id]);
    expect(ids.sort(compareEntries).map((e) => e[0])).toEqual(['n9', 'n10', 'r1', 'w5']);
  });
});
