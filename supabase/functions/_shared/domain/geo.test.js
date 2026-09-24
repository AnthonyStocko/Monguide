import { describe, expect, it } from 'vitest';
import { roundCoord } from './geo.js';

describe('roundCoord', () => {
  it('arrondit à 2 décimales par défaut', () => {
    expect(roundCoord(48.856613)).toBe(48.86);
    expect(roundCoord(2.352222)).toBe(2.35);
    expect(roundCoord(-3.704379)).toBe(-3.7);
  });

  it('accepte une autre précision', () => {
    expect(roundCoord(48.856613, 4)).toBe(48.8566);
    expect(roundCoord(48.856613, 0)).toBe(49);
  });

  it('ne produit jamais -0', () => {
    expect(Object.is(roundCoord(-0.001), 0)).toBe(true);
  });
});
