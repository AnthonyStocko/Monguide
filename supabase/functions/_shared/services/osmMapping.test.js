import { describe, expect, it } from 'vitest';
import { displayName } from '../domain/displayName.js';
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

  it('utilise le centre d\'un chemin ou d\'une relation ; name tel quel et ses variantes dans names', () => {
    const place = osmElementToPlace(
      { type: 'way', id: 7, center: { lat: 46, lon: 4.7 }, tags: { leisure: 'park', name: 'Parc Vermorel', 'name:en': 'Vermorel Park' } },
      { ...opts, lang: 'en' }
    );
    expect(place).toMatchObject({ id: 'osm:way/7', name: 'Parc Vermorel', names: { en: 'Vermorel Park' }, lat: 46, lon: 4.7, indoor: false });
    expect(displayName(place, 'en')).toBe('Vermorel Park');
    expect(displayName(place, 'fr')).toBe('Parc Vermorel');
    expect(place).not.toHaveProperty('food');
    expect(isPlace(place)).toBe(true);
  });

  it('nom bilingue : name gardé tel quel, variantes des langues utiles seulement, différentes de name', () => {
    const place = osmElementToPlace(
      {
        type: 'way',
        id: 8,
        center: { lat: 50.8467, lon: 4.3525 },
        tags: { leisure: 'park', name: 'Parc de Bruxelles - Warandepark', 'name:fr': 'Parc de Bruxelles', 'name:nl': 'Warandepark', 'name:ja': 'ブリュッセル公園', 'name:de': 'Parc de Bruxelles - Warandepark' }
      },
      opts
    );
    expect(place.name).toBe('Parc de Bruxelles - Warandepark');
    expect(place.names).toEqual({ fr: 'Parc de Bruxelles', nl: 'Warandepark' });
    expect(displayName(place, 'fr')).toBe('Parc de Bruxelles');
    expect(displayName(place, 'en')).toBe('Parc de Bruxelles - Warandepark');
  });

  it('sans name : la variante de la langue demandée devient name, sans être répétée dans names', () => {
    const place = osmElementToPlace({ type: 'node', id: 9, lat: 45, lon: 4, tags: { amenity: 'restaurant', 'name:fr': 'Chez A', 'name:en': 'At A' } }, opts);
    expect(place.name).toBe('Chez A');
    expect(place.names).toEqual({ en: 'At A' });
    expect(osmElementToPlace({ type: 'node', id: 9, lat: 45, lon: 4, tags: { amenity: 'restaurant', 'name:en': 'At A' } }, opts)).toBeNull();
  });

  it('lieu sans variante : pas de champ names', () => {
    expect(osmElementToPlace({ type: 'node', id: 10, lat: 45, lon: 4, tags: { amenity: 'restaurant', name: 'Le Bouchon', 'name:fr': 'Le Bouchon' } }, opts)).not.toHaveProperty('names');
  });

  it('ignore les éléments sans nom (restaurants compris), sans position ou non retenus', () => {
    expect(osmElementToPlace({ type: 'node', id: 1, lat: 1, lon: 1, tags: { amenity: 'restaurant' } }, opts)).toBeNull();
    expect(osmElementToPlace({ type: 'way', id: 2, tags: { leisure: 'park', name: 'P' } }, opts)).toBeNull();
    expect(osmElementToPlace({ type: 'node', id: 3, lat: 1, lon: 1, tags: { amenity: 'bench', name: 'B' } }, opts)).toBeNull();
  });
});
