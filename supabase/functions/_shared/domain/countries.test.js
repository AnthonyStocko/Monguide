import { describe, expect, it } from 'vitest';
import { SUPPORTED_COUNTRIES, countryInfo, isSupportedCountry } from './countries.js';

describe('countries', () => {
  it('prend en charge la France avec son fuseau, sa monnaie et son fournisseur', () => {
    expect(countryInfo('FR')).toEqual({ code: 'FR', timezone: 'Europe/Paris', currency: 'EUR', provider: 'fr' });
    expect(countryInfo('fr')?.code).toBe('FR');
  });

  it('refuse un pays non pris en charge ou une valeur invalide', () => {
    expect(countryInfo('XX')).toBeNull();
    expect(countryInfo(undefined)).toBeNull();
    expect(isSupportedCountry('ZZ')).toBe(false);
    expect(isSupportedCountry('FR')).toBe(true);
  });

  it('ne donne que des fuseaux IANA valides', () => {
    for (const { timezone } of Object.values(SUPPORTED_COUNTRIES)) {
      expect(() => new Intl.DateTimeFormat('en', { timeZone: timezone })).not.toThrow();
    }
  });
});
