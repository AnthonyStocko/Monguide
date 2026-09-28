import { describe, expect, it } from 'vitest';
import { BASE_NAME_LANGUAGES, countryInfo } from '../../supabase/functions/_shared/domain/config/countries.js';
import { COUNTRIES, MAX_STORAGE_BYTES, configuredNameLanguages, countryConfig, selectCountries } from './config.js';

describe('countries.json', () => {
  it('pays pris en charge, codes uniques, champs complets', () => {
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
    for (const c of COUNTRIES) {
      expect(countryInfo(c.code), c.code).not.toBeNull();
      expect(c.geofabrik, c.code).toMatch(/^[a-z-]+\/[a-z-]+$/);
      expect(typeof c.heritageFallback, c.code).toBe('boolean');
      expect(c.minRestaurants, c.code).toBeGreaterThan(0);
      for (const lang of c.languages) expect(lang, c.code).toMatch(/^[a-z]{2,3}$/);
    }
  });

  it('les langues de chaque pays couvrent ses langues locales (countries.js)', () => {
    for (const c of COUNTRIES) expect(c.languages.slice().sort(), c.code).toEqual(expect.arrayContaining(countryInfo(c.code).languages));
  });

  it('la France reste sans repli du patrimoine (Mérimée, Muséofile)', () => {
    expect(countryConfig('FR')).toMatchObject({ geofabrik: 'europe/france', heritageFallback: false, minRestaurants: 60000 });
  });

  it('plafond de stockage : 200 Mo (Bloc A)', () => {
    expect(MAX_STORAGE_BYTES).toBe(200 * 1024 * 1024);
  });
});

describe('selectCountries', () => {
  const list = [{ code: 'FR' }, { code: 'BE' }, { code: 'LU' }];

  it('tous pour "all" ou une valeur vide', () => {
    expect(selectCountries('all', list)).toEqual(list);
    expect(selectCountries('', list)).toEqual(list);
    expect(selectCountries(undefined, list)).toEqual(list);
  });

  it('un code ou une liste, casse indifférente, dans l’ordre de la configuration', () => {
    expect(selectCountries('be', list)).toEqual([{ code: 'BE' }]);
    expect(selectCountries('LU, fr', list)).toEqual([{ code: 'FR' }, { code: 'LU' }]);
  });

  it('refuse un pays non configuré', () => {
    expect(() => selectCountries('PT', list)).toThrow(/pays non configuré : PT/);
  });
});

describe('configuredNameLanguages', () => {
  it('langues de base et langues des pays, triées, sans doublon', () => {
    expect(configuredNameLanguages([{ languages: ['nl', 'fr'] }, { languages: ['lb'] }])).toEqual([...new Set([...BASE_NAME_LANGUAGES, 'lb'])].sort());
    expect(configuredNameLanguages([])).toEqual([...BASE_NAME_LANGUAGES].sort());
  });
});
