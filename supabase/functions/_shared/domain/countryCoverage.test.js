import { describe, expect, it } from 'vitest';
import { SUPPORTED_COUNTRIES } from './config/countries.js';
import { COUNTRY_SHAPES } from './config/countryShapes.js';
import { countriesInCircle } from './countryCoverage.js';

/** Carré de 1° autour de (0,5 ; 0,5), avec un trou de 0,2° au centre. */
const SQUARE = {
  AA: {
    bbox: [0, 0, 1, 1],
    polygons: [
      [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0]
        ],
        [
          [0.4, 0.4],
          [0.6, 0.4],
          [0.6, 0.6],
          [0.4, 0.6],
          [0.4, 0.4]
        ]
      ]
    ]
  }
};

describe('countriesInCircle (formes de test)', () => {
  it('centre à l’intérieur', () => {
    expect(countriesInCircle({ lat: 0.2, lon: 0.2 }, 1, SQUARE)).toEqual(['AA']);
  });

  it('centre dehors, bord à moins du rayon ; au-delà du rayon, rien', () => {
    // 0,1° de longitude à l'équateur ≈ 11,1 km du bord ouest.
    expect(countriesInCircle({ lat: 0.5, lon: -0.1 }, 12, SQUARE)).toEqual(['AA']);
    expect(countriesInCircle({ lat: 0.5, lon: -0.1 }, 10, SQUARE)).toEqual([]);
  });

  it('centre dans un trou : touché seulement si le bord du trou est dans le rayon', () => {
    expect(countriesInCircle({ lat: 0.5, lon: 0.5 }, 5, SQUARE)).toEqual([]);
    expect(countriesInCircle({ lat: 0.5, lon: 0.5 }, 12, SQUARE)).toEqual(['AA']);
  });
});

describe('countriesInCircle (contours Geofabrik)', () => {
  const at = (lat, lon, r) => countriesInCircle({ lat, lon }, r);

  it('un contour pour chaque pays pris en charge', () => {
    expect(Object.keys(COUNTRY_SHAPES).sort()).toEqual(Object.keys(SUPPORTED_COUNTRIES).sort());
  });

  it('villes loin des frontières : un seul pays', () => {
    expect(at(45.99, 4.72, 20)).toEqual(['FR']); // Villefranche-sur-Saône
    expect(at(48.857, 2.352, 40)).toEqual(['FR']); // Paris
    expect(at(50.8467, 4.3525, 10)).toEqual(['BE']); // Bruxelles
  });

  it('villes frontalières : les voisins dans le rayon', () => {
    expect(at(50.63, 3.06, 20)).toEqual(['BE', 'FR']); // Lille
    expect(at(48.58, 7.75, 20)).toEqual(['DE', 'FR']); // Strasbourg
    expect(at(43.775, 7.5, 10)).toEqual(['FR', 'IT']); // Menton
    expect(at(49.61, 6.13, 20)).toEqual(['BE', 'DE', 'FR', 'LU']); // Luxembourg
  });

  it('le rayon compte : Nice touche l’Italie à 40 km, pas à 20 km', () => {
    expect(at(43.7, 7.27, 20)).toEqual(['FR']);
    expect(at(43.7, 7.27, 40)).toEqual(['FR', 'IT']);
  });
});
