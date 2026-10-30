import { describe, expect, it } from 'vitest';
import { carbonLines } from './carbonLines.js';

describe('carbonLines', () => {
  const byMode = { walk: 0, bike: 0, transit: 0.4, car: 3.2 };
  it('trajet prévu en premier, puis transports en commun, voiture, à pied, à vélo', () => {
    expect(carbonLines({ mode: 'car', carbon: { byMode } }).map((l) => [l.mode, l.actual, l.key])).toEqual([
      ['car', true, 'generation.carbonActual'],
      ['transit', false, 'generation.carbonIf.transit'],
      ['walk', false, 'generation.carbonIf.walk'],
      ['bike', false, 'generation.carbonIf.bike']
    ]);
    expect(carbonLines({ mode: 'walk', carbon: { byMode } }).map((l) => l.mode)).toEqual(['walk', 'transit', 'car', 'bike']);
  });
});
