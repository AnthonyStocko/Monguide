import { describe, expect, it } from 'vitest';
import { getProvider } from './index.js';

describe('getProvider', () => {
  it('renvoie le fournisseur "fr" pour la France', () => {
    const provider = getProvider('FR');
    expect(provider?.code).toBe('fr');
    for (const method of ['heritage', 'terroir', 'fuel', 'co2Factors', 'certificationLabels']) {
      expect(typeof provider[method]).toBe('function');
    }
    expect(getProvider('fr')).toBe(provider);
  });

  it('renvoie null pour un pays non pris en charge', () => {
    expect(getProvider('DE')).toBeNull();
    expect(getProvider(undefined)).toBeNull();
  });
});
