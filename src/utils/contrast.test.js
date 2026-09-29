import { describe, expect, it } from 'vitest';
import { blend, contrastRatio, parseHex } from './contrast.js';

describe('contrastRatio', () => {
  it('noir sur blanc : 21', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });

  it('symétrique', () => {
    expect(contrastRatio('#047857', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#047857'), 10);
  });

  it('valeur de référence : #767676 sur blanc ≈ 4,54', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2);
  });

  it('refuse une couleur mal écrite', () => {
    expect(() => parseHex('vert')).toThrow();
  });
});

describe('blend', () => {
  it('alpha 1 : couleur du dessus ; alpha 0 : couleur du dessous', () => {
    expect(blend([10, 20, 30], 1, [200, 200, 200])).toEqual([10, 20, 30]);
    expect(blend([10, 20, 30], 0, [200, 200, 200])).toEqual([200, 200, 200]);
  });
});
