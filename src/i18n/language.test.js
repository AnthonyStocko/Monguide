import { describe, expect, it } from 'vitest';
import { pickLanguage } from './language.js';

describe('pickLanguage', () => {
  it('garde le choix enregistré', () => {
    expect(pickLanguage('en', ['fr-FR'])).toBe('en');
    expect(pickLanguage('fr', ['de-DE'])).toBe('fr');
  });

  it('prend le français si le téléphone est en français', () => {
    expect(pickLanguage(null, ['fr-FR', 'en-US'])).toBe('fr');
    expect(pickLanguage(null, ['fr-CA'])).toBe('fr');
    expect(pickLanguage(undefined, ['FR'])).toBe('fr');
  });

  it("prend l'anglais pour toute autre langue", () => {
    expect(pickLanguage(null, ['de-DE', 'fr-FR'])).toBe('en');
    expect(pickLanguage(null, ['es'])).toBe('en');
    expect(pickLanguage(null, [])).toBe('en');
    expect(pickLanguage(null)).toBe('en');
  });

  it('ignore un choix enregistré non pris en charge', () => {
    expect(pickLanguage('it', ['fr-FR'])).toBe('fr');
    expect(pickLanguage('it', ['it-IT'])).toBe('en');
  });
});
