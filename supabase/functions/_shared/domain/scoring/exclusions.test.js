import { describe, expect, it } from 'vitest';
import { RULES } from '../config/rules.js';
import { applyPlaceQuality, collapseEnsembles, isGenericLabel, placeVerdict } from './exclusions.js';

const place = (name, signals, extra = {}) => ({ id: `wikidata:${name}`, name, category: 'monument', lat: 50.85, lon: 4.35, source: 'wikidata', certified: true, indoor: null, signals, ...extra });

describe('isGenericLabel', () => {
  it.each([
    'Maison traditionnelle',
    'Ensemble de maisons traditionnelles',
    'Ensemble de trois maisons traditionnelles',
    'Arrière maison traditionnelle',
    'Maison néoclassique',
    'Immeuble',
    'Immeuble (Lyon)',
    'Maison (Colmar)',
    "Jardin d'enfants n°4",
    'Jardin d’enfants n° 12',
    'Kleuterschool nr. 4',
    'Traditioneel achterhuis',
    'École',
    'Rue Du Lombard 30 - 32',
    'Casa del Carrer Ciutat, 7',
    "Edifici d'habitatges Milans, 5",
    '12'
  ])('« %s » est générique', (name) => {
    expect(isGenericLabel(name)).toBe(true);
  });

  it.each([
    'Grand-Place',
    'Manneken-Pis',
    'Maison des Têtes (Colmar)',
    'Maison Pfister (Colmar)',
    'Maison dite des Sires de Villars (Trévoux)',
    'Tour et remparts (Villefranche-sur-Saône)',
    'Hôtel de Limminghe',
    'Galeries royales Saint-Hubert',
    'Casa Batlló',
    'Place d’Unterlinden',
    'Palais de la Bourse'
  ])('« %s » n’est pas générique', (name) => {
    expect(isGenericLabel(name)).toBe(false);
  });
});

describe('placeVerdict', () => {
  const verdict = (p, notoriety = 0) => placeVerdict(p, notoriety, RULES);

  it('écarte un élément d’inventaire au libellé générique sans notoriété', () => {
    expect(verdict(place('Arrière maison traditionnelle', { sitelinks: 0, types: ['Q3947'] }))).toEqual({ action: 'exclude', reason: 'generic_label' });
    // Lieu Mérimée sans identifiant Wikidata : le libellé suffit.
    expect(verdict(place('Immeuble (Lyon)', undefined, { source: 'merimee' }))).toEqual({ action: 'exclude', reason: 'generic_label' });
  });

  it('écarte une nature trop générique sous le seuil d’articles, la garde au-dessus', () => {
    expect(verdict(place('Hôtel de Roest d’Alkemade', { sitelinks: 0, types: ['Q41176'] }))).toEqual({ action: 'exclude', reason: 'generic_class' });
    expect(verdict(place('Maison Autrique', { sitelinks: 5, types: ['Q41176'] }), 30)).toEqual({ action: 'keep' });
  });

  it('écarte les lieux non visitables (école, usine, magasin, estaminet), sauf très connus : coup d’œil', () => {
    expect(verdict(place('Jardin d’enfants', { sitelinks: 0, types: ['Q3914'] }))).toMatchObject({ action: 'exclude' });
    expect(verdict(place('Voormalige luchterfabriek', { sitelinks: 0, types: ['Q83405'] }))).toEqual({ action: 'exclude', reason: 'non_visitable' });
    expect(verdict(place('Café de la Bourse', { sitelinks: 3, types: ['Q3058833', 'Q3947'] }), 30)).toEqual({ action: 'exclude', reason: 'non_visitable' });
    expect(verdict(place('Palais de la Bourse', { sitelinks: 10, types: ['Q10882966'] }), 55)).toEqual({ action: 'glance', reason: 'non_visitable' });
  });

  it('ne traite jamais une commune, une gare ou une organisation comme un lieu de visite', () => {
    expect(verdict(place('Villefranche-sur-Saône', { sitelinks: 40, types: ['Q484170'] }), 70)).toEqual({ action: 'exclude', reason: 'not_a_place' });
    expect(verdict(place('Bruxelles-Midi', { sitelinks: 27, types: ['Q55488'] }), 65)).toEqual({ action: 'exclude', reason: 'not_a_place' });
    // Périmètre UNESCO cartographié comme espace protégé (OSM) : pas un lieu de visite.
    expect(verdict(place('Site historique de Lyon', { sitelinks: 18, types: ['Q123705', 'Q676050'] }, { category: 'nature' }), 76)).toEqual({ action: 'exclude', reason: 'not_a_place' });
  });

  it('statue, fontaine, façade : coup d’œil (Manneken-Pis)', () => {
    expect(verdict(place('Manneken-Pis', { sitelinks: 67, types: ['Q860861', 'Q358'] }), 80)).toEqual({ action: 'glance', reason: 'glance_class' });
  });

  it('un musée reste une visite, même installé dans une maison', () => {
    expect(verdict(place('Maison Autrique', { sitelinks: 1, types: ['Q3947', 'Q33506'] }, { category: 'museum' }))).toEqual({ action: 'keep' });
  });

  it('ne touche pas aux restaurants ni aux marchés', () => {
    expect(verdict(place('Maison', { types: ['Q3947'] }, { category: 'restaurant' }))).toEqual({ action: 'keep' });
  });
});

describe('collapseEnsembles', () => {
  it('un ensemble et ses parties : un seul lieu, le mieux noté', () => {
    const galeries = place('Galeries royales Saint-Hubert', undefined, { wikidata: 'Q1491935', notoriety: 60 });
    const galerieDuRoi = place('Galerie du Roi', { partOf: ['Q1491935'] }, { wikidata: 'Q3094673', notoriety: 20 });
    const galerieDeLaReine = place('Galerie de la Reine', { partOf: ['Q1491935'] }, { wikidata: 'Q2285205', notoriety: 25 });
    const other = place('Grand-Place', undefined, { wikidata: 'Q215429', notoriety: 95 });
    const { places, removed } = collapseEnsembles([galerieDuRoi, galeries, other, galerieDeLaReine]);
    expect(places.map((p) => p.name)).toEqual(['Galeries royales Saint-Hubert', 'Grand-Place']);
    expect(removed.map((p) => p.name)).toEqual(['Galerie du Roi', 'Galerie de la Reine']);
  });

  it('garde la partie si elle est plus connue que l’ensemble ; un musée reste à part', () => {
    const ensemble = place('Ensemble', undefined, { wikidata: 'Q1', notoriety: 5 });
    const part = place('Partie célèbre', { partOf: ['Q1'] }, { wikidata: 'Q2', notoriety: 50 });
    const museum = place('Musée de la ville', { partOf: ['Q1'] }, { wikidata: 'Q3', notoriety: 2, category: 'museum' });
    expect(collapseEnsembles([ensemble, part, museum]).places.map((p) => p.name)).toEqual(['Partie célèbre', 'Musée de la ville']);
  });
});

describe('applyPlaceQuality', () => {
  it('calcule la notoriété, marque coups d’œil et lieux connus, écarte et retire les signaux', () => {
    const { places, excluded } = applyPlaceQuality(
      [
        place('Grand-Place', { sitelinks: 56, langArticle: true, localArticle: true, types: ['Q26987258'], designations: ['Q9259'] }),
        place('Manneken-Pis', { sitelinks: 67, langArticle: true, types: ['Q860861'] }),
        place('Arrière maison traditionnelle', { sitelinks: 0, types: ['Q3947'] }),
        { id: 'osm:way/1', name: 'Parc de Bruxelles', category: 'park', lat: 50.84, lon: 4.36, source: 'osm', certified: false, indoor: false }
      ],
      RULES,
      { today: '2026-10-30' }
    );
    expect(places.map((p) => [p.name, p.notoriety > 0, p.notable ?? false, p.glance ?? false])).toEqual([
      ['Grand-Place', true, true, false],
      ['Manneken-Pis', true, true, true],
      ['Parc de Bruxelles', false, false, false]
    ]);
    expect(places[0].sitelinks).toBe(56);
    expect(places.every((p) => !('signals' in p))).toBe(true);
    expect(excluded).toEqual([{ id: 'wikidata:Arrière maison traditionnelle', name: 'Arrière maison traditionnelle', reason: 'generic_label' }]);
  });
});
