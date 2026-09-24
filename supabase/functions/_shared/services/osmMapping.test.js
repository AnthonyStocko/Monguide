import { describe, expect, it } from 'vitest';
import { isPlace } from '../domain/model.js';
import { osmCategory, osmElementToPlace, osmFood } from './osmMapping.js';

const REGIONAL = ['regional', 'french'];
const opts = { lang: 'fr', regionalCuisines: REGIONAL };

describe('osmCategory', () => {
  it.each([
    [{ amenity: 'restaurant' }, 'restaurant'],
    [{ amenity: 'marketplace' }, 'market'],
    [{ shop: 'farm' }, 'farm'],
    [{ leisure: 'park' }, 'park'],
    [{ boundary: 'protected_area' }, 'nature'],
    [{ tourism: 'viewpoint' }, 'viewpoint'],
    [{ historic: 'wayside_cross' }, 'small_heritage'],
    [{ historic: 'memorial' }, 'small_heritage'],
    [{ historic: 'ruins' }, 'small_heritage'],
    [{ amenity: 'lavoir' }, 'small_heritage'],
    [{ man_made: 'lavoir' }, 'small_heritage']
  ])('%j -> %s', (tags, category) => {
    expect(osmCategory(tags)?.category).toBe(category);
  });

  it('ignore les autres objets', () => {
    expect(osmCategory({ amenity: 'bench' })).toBeNull();
    expect(osmCategory({ historic: 'castle' })).toBeNull();
  });
});

describe('osmFood', () => {
  it('remplit tous les champs à partir des tags', () => {
    expect(
      osmFood(
        {
          cuisine: 'Regional; pizza',
          opening_hours: 'Tu-Sa 12:00-14:00',
          wheelchair: 'limited',
          'diet:vegetarian': 'yes',
          'contact:phone': '+33 4 74 00 00 00',
          'contact:website': 'https://bouchon.example'
        },
        REGIONAL
      )
    ).toEqual({
      cuisine: ['regional', 'pizza'],
      regional: true,
      openingHours: 'Tu-Sa 12:00-14:00',
      wheelchair: 'limited',
      vegetarian: true,
      phone: '+33 4 74 00 00 00',
      website: 'https://bouchon.example'
    });
  });

  it('reconnaît la cuisine française comme régionale et le végétalien comme végétarien', () => {
    expect(osmFood({ cuisine: 'french', 'diet:vegan': 'only' }, REGIONAL)).toMatchObject({ regional: true, vegetarian: true });
  });

  it('préfère phone et website aux variantes contact:*', () => {
    expect(osmFood({ phone: '1', 'contact:phone': '2', website: 'a', 'contact:website': 'b' }, REGIONAL)).toMatchObject({
      phone: '1',
      website: 'a'
    });
  });

  it('laisse vides les champs inconnus et ignore les valeurs invalides', () => {
    expect(osmFood({ cuisine: 'pizza', wheelchair: 'partial', 'diet:vegetarian': 'no' }, REGIONAL)).toEqual({
      cuisine: ['pizza'],
      regional: false,
      vegetarian: false
    });
    expect(osmFood({}, REGIONAL)).toEqual({ regional: false });
  });
});

describe('osmElementToPlace', () => {
  it('convertit un restaurant (intérieur, avec food)', () => {
    const place = osmElementToPlace(
      { type: 'node', id: 42, lat: 45.99, lon: 4.72, tags: { amenity: 'restaurant', name: 'Le Bouchon', cuisine: 'regional' } },
      opts
    );
    expect(place).toMatchObject({ id: 'osm:node/42', name: 'Le Bouchon', category: 'restaurant', indoor: true, certified: false, source: 'osm' });
    expect(place.food).toEqual({ cuisine: ['regional'], regional: true });
    expect(isPlace(place)).toBe(true);
  });

  it('utilise le centre d\'un chemin ou d\'une relation, et le nom dans la langue demandée', () => {
    const place = osmElementToPlace(
      { type: 'way', id: 7, center: { lat: 46, lon: 4.7 }, tags: { leisure: 'park', name: 'Parc Vermorel', 'name:en': 'Vermorel Park' } },
      { ...opts, lang: 'en' }
    );
    expect(place).toMatchObject({ id: 'osm:way/7', name: 'Vermorel Park', lat: 46, lon: 4.7, indoor: false });
    expect(place).not.toHaveProperty('food');
  });

  it('ignore les éléments sans nom (restaurants compris), sans position ou non retenus', () => {
    expect(osmElementToPlace({ type: 'node', id: 1, lat: 1, lon: 1, tags: { amenity: 'restaurant' } }, opts)).toBeNull();
    expect(osmElementToPlace({ type: 'way', id: 2, tags: { leisure: 'park', name: 'P' } }, opts)).toBeNull();
    expect(osmElementToPlace({ type: 'node', id: 3, lat: 1, lon: 1, tags: { amenity: 'bench', name: 'B' } }, opts)).toBeNull();
  });
});
