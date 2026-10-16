import { describe, expect, it } from 'vitest';
import { formatCountry, formatDate, formatNumber, formatRelative } from './format.js';

// Intl utilise des espaces insécables : on les normalise pour comparer.
const plain = (s) => s.replace(/\s/g, ' ');

describe('formatDate', () => {
  const date = new Date(Date.UTC(2026, 8, 24, 12, 0));

  it('formate en français et en anglais', () => {
    expect(formatDate(date, 'fr', { dateStyle: 'long', timeZone: 'UTC' })).toBe('24 septembre 2026');
    expect(formatDate(date, 'en', { dateStyle: 'long', timeZone: 'UTC' })).toBe('September 24, 2026');
  });

  it('respecte le fuseau horaire demandé', () => {
    const late = new Date(Date.UTC(2026, 8, 24, 23, 30));
    expect(formatDate(late, 'fr', { dateStyle: 'long', timeZone: 'Europe/Athens' })).toBe('25 septembre 2026');
  });

  it('accepte une chaîne ISO', () => {
    expect(formatDate('2026-09-24T12:00:00Z', 'fr', { dateStyle: 'long', timeZone: 'UTC' })).toBe('24 septembre 2026');
  });
});

describe('formatNumber', () => {
  it('formate selon la langue', () => {
    expect(plain(formatNumber(1234.5, 'fr'))).toBe('1 234,5');
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
  });

  it('transmet les options Intl', () => {
    expect(plain(formatNumber(12.5, 'fr', { style: 'currency', currency: 'EUR' }))).toBe('12,50 €');
  });
});

describe('formatCountry', () => {
  it('nomme le pays selon la langue, garde un code invalide tel quel', () => {
    expect(formatCountry('BE', 'fr')).toBe('Belgique');
    expect(formatCountry('DE', 'en')).toBe('Germany');
    expect(formatCountry('??', 'fr')).toBe('??');
  });
});

describe('formatRelative', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  it('heure relative dans la langue de l’interface', () => {
    expect(formatRelative('2026-10-16T11:59:50Z', 'fr', now)).toBe('maintenant');
    expect(plain(formatRelative('2026-10-16T11:55:00Z', 'fr', now))).toBe('il y a 5 minutes');
    expect(plain(formatRelative('2026-10-16T09:00:00Z', 'en', now))).toBe('3 hours ago');
    expect(formatRelative('2026-10-15T12:00:00Z', 'fr', now)).toBe('hier');
    expect(plain(formatRelative('2026-08-16T12:00:00Z', 'en', now))).toBe('2 months ago');
  });
});
