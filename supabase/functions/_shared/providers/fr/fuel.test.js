import { describe, expect, it } from 'vitest';
import { averageFuelPrices } from './fuel.js';

const POINT = { lat: 45.99, lon: 4.72 };

describe('averageFuelPrices', () => {
  it('fait la moyenne par carburant des stations du rayon, en ignorant les prix absents', () => {
    const rows = [
      { latitude: 4594300, longitude: 471500, 'Prix Gazole': 2.5, 'Prix E10': null, 'Prix SP98': 2.3 },
      { latitude: 4598000, longitude: 472000, 'Prix Gazole': 2.4, 'Prix E10': 2.1, 'Prix SP98': 2.2 },
      // Hors du rayon de 20 km (Lyon Sud).
      { latitude: 4570000, longitude: 482000, 'Prix Gazole': 1.0 }
    ];
    expect(averageFuelPrices(rows, POINT, 20)).toEqual({
      currency: 'EUR',
      stationCount: 2,
      prices: {
        diesel: { average: 2.45, stations: 2 },
        sp98: { average: 2.25, stations: 2 },
        e10: { average: 2.1, stations: 1 }
      }
    });
  });

  it('renvoie une liste vide sans station', () => {
    expect(averageFuelPrices([], POINT, 20)).toEqual({ currency: 'EUR', stationCount: 0, prices: {} });
  });
});
