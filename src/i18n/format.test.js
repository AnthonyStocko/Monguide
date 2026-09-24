import { describe, expect, it } from 'vitest';
import { formatDate, formatNumber } from './format.js';

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
