import { describe, expect, it } from 'vitest';
import { GENERIC_PLACE_NAMES, displayName, genericPlaceName, nameVariants, stepDisplayName } from './displayName.js';

const place = (extra) => ({ id: 'osm:node/1', category: 'monument', lat: 50.8467, lon: 4.3525, source: 'osm', certified: false, indoor: null, ...extra });

describe('displayName', () => {
  const grandPlace = place({ name: 'Grand-Place - Grote Markt', names: { fr: 'Grand-Place', nl: 'Grote Markt' } });

  it('donne la variante de la langue de l’interface', () => {
    expect(displayName(grandPlace, 'fr')).toBe('Grand-Place');
  });

  it('garde le nom bilingue quand la langue n’a pas de variante', () => {
    expect(displayName(grandPlace, 'en')).toBe('Grand-Place - Grote Markt');
  });

  it('lieu français sans names : name', () => {
    const bouchon = place({ name: 'Le Bouchon', category: 'restaurant' });
    expect(displayName(bouchon, 'fr')).toBe('Le Bouchon');
    expect(displayName(bouchon, 'en')).toBe('Le Bouchon');
  });

  it('petit patrimoine sans nom : nom générique dans la langue de l’interface', () => {
    const lavoir = place({ name: 'Lavoir', category: 'small_heritage', unnamed: true });
    expect(displayName(lavoir, 'fr')).toBe('Lavoir');
    expect(displayName(lavoir, 'en')).toBe('Wash house');
    const viewpoint = place({ name: 'Viewpoint', category: 'viewpoint', unnamed: true });
    expect(displayName(viewpoint, 'fr')).toBe('Point de vue');
  });

  it('nom générique inconnu (séjour ancien, table modifiée) : name tel quel', () => {
    expect(displayName(place({ name: 'Fontaine', category: 'small_heritage', unnamed: true }), 'en')).toBe('Fontaine');
  });

  it('langue sans noms génériques : français', () => {
    expect(displayName(place({ name: 'Ruins', category: 'small_heritage', unnamed: true }), 'nl')).toBe('Ruines');
  });
});

describe('stepDisplayName', () => {
  it('lieu, puis titre, puis null', () => {
    expect(stepDisplayName({ place: place({ name: 'Grand-Place - Grote Markt', names: { fr: 'Grand-Place' } }) }, 'fr')).toBe('Grand-Place');
    expect(stepDisplayName({ title: 'Dîner chez Paul' }, 'en')).toBe('Dîner chez Paul');
    expect(stepDisplayName({}, 'fr')).toBeNull();
  });
});

describe('nameVariants', () => {
  it('garde les langues demandées qui diffèrent de name, clés triées', () => {
    const tags = { name: 'Grand-Place - Grote Markt', 'name:nl': 'Grote Markt', 'name:fr': 'Grand-Place', 'name:ja': 'グラン＝プラス', 'name:de': 'Grand-Place - Grote Markt' };
    const variants = nameVariants(tags, ['fr', 'nl', 'de', 'en']);
    expect(variants).toEqual({ fr: 'Grand-Place', nl: 'Grote Markt' });
    expect(Object.keys(variants)).toEqual(['fr', 'nl']);
  });

  it('undefined si aucune variante utile', () => {
    expect(nameVariants({ name: 'A', 'name:fr': ' A ' }, ['fr'])).toBeUndefined();
    expect(nameVariants({}, ['fr'])).toBeUndefined();
  });

  it('sans name, toutes les variantes demandées sont gardées', () => {
    expect(nameVariants({ 'name:fr': 'Chez A' }, ['fr', 'en'])).toEqual({ fr: 'Chez A' });
  });
});

describe('genericPlaceName', () => {
  it('traduit, avec le français à défaut', () => {
    expect(genericPlaceName('lavoir', 'en')).toBe('Wash house');
    expect(genericPlaceName('lavoir', 'de')).toBe('Lavoir');
    expect(genericPlaceName('fountain', 'fr')).toBeNull();
  });

  it('mêmes sous-catégories dans chaque langue', () => {
    expect(Object.keys(GENERIC_PLACE_NAMES.en).sort()).toEqual(Object.keys(GENERIC_PLACE_NAMES.fr).sort());
  });
});
