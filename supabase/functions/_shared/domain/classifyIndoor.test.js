import { describe, expect, it } from 'vitest';
import { classifyIndoor } from './classifyIndoor.js';

describe('classifyIndoor', () => {
  it('classe les musées et les restaurants en intérieur', () => {
    expect(classifyIndoor({ category: 'museum', name: 'Musée Paul-Dini' })).toBe(true);
    expect(classifyIndoor({ category: 'restaurant', name: 'Le Bouchon' })).toBe(true);
  });

  it.each([
    ['Château de Montmelas', 'château'],
    ['Église Notre-Dame-des-Marais', 'église'],
    ['Abbaye de Cluny', ''],
    ['Saint Paul', 'cathedral'],
    ['Hôtel de ville', 'hôtel de ville'],
    ['Chapelle Saint-Roch', '']
  ])('classe le monument « %s » en intérieur', (name, type) => {
    expect(classifyIndoor({ category: 'monument', name, type })).toBe(true);
  });

  it('classe les ruines en extérieur, même d\'un château', () => {
    expect(classifyIndoor({ category: 'monument', name: 'Ruines du château', type: 'château' })).toBe(false);
    expect(classifyIndoor({ category: 'monument', name: 'Castle remains' })).toBe(false);
  });

  it.each(['park', 'nature', 'viewpoint', 'small_heritage'])('classe la catégorie %s en extérieur', (category) => {
    expect(classifyIndoor({ category, name: 'Château d\'eau' })).toBe(false);
  });

  it('distingue marché de plein air et halles couvertes', () => {
    expect(classifyIndoor({ category: 'market', name: 'Marché du samedi' })).toBe(false);
    expect(classifyIndoor({ category: 'market', name: 'Les Halles de Villefranche' })).toBe(true);
  });

  it('renvoie null quand rien ne permet de conclure', () => {
    expect(classifyIndoor({ category: 'monument', name: 'Croix de chemin', type: 'croix' })).toBeNull();
    expect(classifyIndoor({ category: 'farm', name: 'Ferme des Grillons' })).toBeNull();
    expect(classifyIndoor({ category: 'monument' })).toBeNull();
  });

  it('ne se laisse pas piéger par un mot contenu dans un autre', () => {
    expect(classifyIndoor({ category: 'monument', name: 'Chateaubriand', type: 'maison' })).toBeNull();
  });
});
