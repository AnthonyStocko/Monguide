import { describe, expect, it } from 'vitest';
import { isPlace } from '../../domain/model.js';
import { merimeeToPlace, museofileToPlace } from './heritage.js';
import { capitalize, parseLatLon } from './dataGouv.js';

describe('merimeeToPlace', () => {
  const row = {
    Reference: 'PA00118092',
    Titre_editorial_de_la_notice: 'Hôtel de ville',
    Denomination_de_l_edifice: 'hôtel de ville',
    coordonnees_au_format_WGS84: '45.9880320673964,4.71817168046388',
    Commune_forme_editoriale: 'Villefranche-sur-Saône',
    Siecle_de_la_campagne_principale_de_construction: '3e quart 17e siècle'
  };

  it('produit un Place certifié "Monument historique"', () => {
    const place = merimeeToPlace(row);
    expect(place).toEqual({
      id: 'merimee:PA00118092',
      name: 'Hôtel de ville (Villefranche-sur-Saône)',
      category: 'monument',
      lat: 45.9880320673964,
      lon: 4.71817168046388,
      source: 'monuments',
      certified: true,
      certification: 'monument_historique',
      indoor: true,
      url: 'https://pop.culture.gouv.fr/notice/merimee/PA00118092',
      description: '3e quart 17e siècle'
    });
    expect(isPlace(place)).toBe(true);
  });

  it('reprend la dénomination quand le titre manque', () => {
    expect(merimeeToPlace({ ...row, Titre_editorial_de_la_notice: null, Denomination_de_l_edifice: 'croix de chemin' })).toMatchObject({
      name: 'Croix de chemin (Villefranche-sur-Saône)',
      indoor: null
    });
  });

  it("n'ajoute pas la commune si le titre la contient déjà", () => {
    expect(merimeeToPlace({ ...row, Titre_editorial_de_la_notice: 'Château de Villefranche-sur-Saône' }).name).toBe('Château de Villefranche-sur-Saône');
  });

  it('ignore un monument sans coordonnées', () => {
    expect(merimeeToPlace({ ...row, coordonnees_au_format_WGS84: null })).toBeNull();
  });
});

describe('museofileToPlace', () => {
  const row = {
    Identifiant: 'M1128',
    Nom_officiel: 'musée des sapeurs-pompiers de Lyon',
    Coordonnees: '45.790491, 4.797411',
    URL: 'museepompiers.com/',
    Domaine_thematique: 'Ethnologie;Histoire'
  };

  it('produit un Place certifié "Musée de France", en intérieur', () => {
    const place = museofileToPlace(row);
    expect(place).toMatchObject({
      id: 'musee:M1128',
      name: 'Musée des sapeurs-pompiers de Lyon',
      category: 'museum',
      certification: 'musee_de_france',
      certified: true,
      indoor: true,
      url: 'https://museepompiers.com/',
      description: 'Ethnologie, Histoire'
    });
    expect(isPlace(place)).toBe(true);
  });

  it('ignore un musée sans coordonnées', () => {
    expect(museofileToPlace({ ...row, Coordonnees: null })).toBeNull();
  });
});

describe('dataGouv helpers', () => {
  it('lit "lat, lon" et rejette les valeurs invalides', () => {
    expect(parseLatLon('45.79, 4.79')).toEqual({ lat: 45.79, lon: 4.79 });
    expect(parseLatLon('abc')).toBeNull();
    expect(parseLatLon('95, 4')).toBeNull();
    expect(parseLatLon(null)).toBeNull();
  });

  it('met une capitale initiale', () => {
    expect(capitalize('écomusée')).toBe('Écomusée');
    expect(capitalize('')).toBe('');
  });
});
