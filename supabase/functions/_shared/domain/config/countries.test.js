import { describe, expect, it } from 'vitest';
import { BASE_NAME_LANGUAGES, EU_MEMBERS, SUPPORTED_COUNTRIES, countryInfo, dinnerTimeFor, isSupportedCountry, nameLanguages } from './countries.js';
import { RULES } from './rules.js';

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

  it("heure du dîner : 21:00 en Espagne, 20:00 au Portugal et en Italie, 19:30 ailleurs", () => {
    expect(dinnerTimeFor('ES', RULES)).toBe('21:00');
    expect(dinnerTimeFor('pt', RULES)).toBe('20:00');
    expect(dinnerTimeFor('IT', RULES)).toBe('20:00');
    expect(dinnerTimeFor('FR', RULES)).toBe('19:30');
    expect(dinnerTimeFor('XX', RULES)).toBe('19:30');
    for (const { dinnerTime } of Object.values(SUPPORTED_COUNTRIES)) if (dinnerTime) expect(dinnerTime).toMatch(/^\d{2}:\d{2}$/);
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

describe('nameLanguages', () => {
  it('langues de base, plus les langues locales des pays, triées sans doublon', () => {
    expect(nameLanguages([])).toEqual([...BASE_NAME_LANGUAGES].sort());
    expect(nameLanguages(['FR', 'BE'])).toEqual([...BASE_NAME_LANGUAGES].sort());
    expect(nameLanguages(['be', 'LU', 'PL'])).toEqual(['ca', 'de', 'en', 'es', 'eu', 'fr', 'it', 'lb', 'nl', 'pl', 'pt']);
  });

  it('ignore un code inconnu', () => {
    expect(nameLanguages(['XX'])).toEqual(nameLanguages([]));
  });
});
