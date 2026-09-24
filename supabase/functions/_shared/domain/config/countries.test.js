import { describe, expect, it } from 'vitest';
import { EU_MEMBERS, SUPPORTED_COUNTRIES, countryInfo, isSupportedCountry } from './countries.js';

describe('countries', () => {
  it('couvre les 27 pays de l\'UE et 5 pays hors UE', () => {
    expect(Object.keys(SUPPORTED_COUNTRIES)).toHaveLength(32);
    expect(EU_MEMBERS).toHaveLength(27);
    for (const code of ['GB', 'CH', 'NO', 'IS', 'LI']) {
      expect(isSupportedCountry(code)).toBe(true);
      expect(EU_MEMBERS).not.toContain(code);
    }
  });

  it('attribue le fournisseur "fr" à la France et "eu" aux autres', () => {
    expect(countryInfo('fr')).toMatchObject({ code: 'FR', currency: 'EUR', provider: 'fr' });
    expect(Object.entries(SUPPORTED_COUNTRIES).filter(([, c]) => c.provider === 'fr').map(([k]) => k)).toEqual(['FR']);
  });

  it('donne la monnaie de chaque pays (ISO 4217), reconnue par Intl', () => {
    expect(countryInfo('PL').currency).toBe('PLN');
    expect(countryInfo('GB').currency).toBe('GBP');
    expect(countryInfo('LI').currency).toBe('CHF');
    for (const { currency } of Object.values(SUPPORTED_COUNTRIES)) {
      expect(() => new Intl.NumberFormat('fr', { style: 'currency', currency })).not.toThrow();
    }
  });

  it('donne au moins une langue locale par pays', () => {
    for (const { languages } of Object.values(SUPPORTED_COUNTRIES)) expect(languages.length).toBeGreaterThan(0);
  });

  it('refuse un pays non pris en charge ou une valeur invalide', () => {
    expect(countryInfo('TR')).toBeNull();
    expect(countryInfo(undefined)).toBeNull();
    expect(isSupportedCountry('US')).toBe(false);
  });

  it('ne fixe aucun fuseau horaire', () => {
    for (const c of Object.values(SUPPORTED_COUNTRIES)) expect(c).not.toHaveProperty('timezone');
  });
});
