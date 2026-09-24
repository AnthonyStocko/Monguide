import { describe, expect, it } from 'vitest';
import { API_VERSION, checkApiVersion, compareVersions, isValidVersion } from './version.js';

describe('checkApiVersion', () => {
  it('accepte la version courante et la précédente', () => {
    expect(checkApiVersion(3, 3)).toBe('ok');
    expect(checkApiVersion(2, 3)).toBe('ok');
    expect(checkApiVersion(API_VERSION)).toBe('ok');
  });

  it('refuse une version plus ancienne comme obsolète', () => {
    expect(checkApiVersion(1, 3)).toBe('outdated');
  });

  it('refuse une version illisible ou future', () => {
    expect(checkApiVersion(4, 3)).toBe('unsupported');
    expect(checkApiVersion(0, 3)).toBe('unsupported');
    expect(checkApiVersion(Number.NaN, 3)).toBe('unsupported');
    expect(checkApiVersion(1.5, 3)).toBe('unsupported');
  });
});

describe('compareVersions', () => {
  it('compare numériquement chaque composant', () => {
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.1.0', '0.2.0')).toBeLessThan(0);
    expect(compareVersions('2.0.0', '10.0.0')).toBeLessThan(0);
  });

  it('rejette une version mal formée', () => {
    expect(() => compareVersions('1.2', '1.2.0')).toThrow(RangeError);
    expect(() => compareVersions('1.2.0', 'v1.2.0')).toThrow(RangeError);
  });
});

describe('isValidVersion', () => {
  it('reconnaît le format majeur.mineur.correctif', () => {
    expect(isValidVersion('0.1.0')).toBe(true);
    expect(isValidVersion('1.2')).toBe(false);
    expect(isValidVersion('1.2.0-beta')).toBe(false);
    expect(isValidVersion(undefined)).toBe(false);
  });
});
