import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { mergeRules } from './config/mergeRules.js';
import { aiReviewAvailable, cleanWishes, hasWish, toggleWish, validateWishes, WISH_SUGGESTIONS } from './wishes.js';

describe('« Vos envies »', () => {
  it('texte brut : sans HTML ni caractère de contrôle, espaces normalisés', () => {
    expect(cleanWishes('  Peu de <b>musées</b>\n\n\tet   du vin  ')).toBe('Peu de musées et du vin');
    expect(cleanWishes(`A${String.fromCharCode(0x2028)}B\u0000C`)).toBe('A B C');
    expect(cleanWishes(null)).toBe('');
    expect(cleanWishes(42)).toBe('');
  });

  it('200 caractères au plus, après nettoyage', () => {
    expect(RULES.ai.wishesMaxLength).toBe(200);
    expect(validateWishes('x'.repeat(200), RULES)).toBeNull();
    expect(validateWishes('x'.repeat(201), RULES)).toBe('wishesTooLong');
    // Les espaces superflus ne comptent pas.
    expect(validateWishes(`${'x'.repeat(200)}      `, RULES)).toBeNull();
  });

  it('suggestions en puces : ajoutées puis retirées, jamais au-delà de la limite', () => {
    expect(WISH_SUGGESTIONS).toEqual(['wine', 'lessWalking', 'kids', 'nature', 'fewMuseums']);
    let text = toggleWish('', 'Peu de musées', RULES);
    expect(text).toBe('Peu de musées');
    text = toggleWish(text, 'On adore le vin', RULES);
    expect(text).toBe('Peu de musées, On adore le vin');
    expect(hasWish(text, 'On adore le vin')).toBe(true);
    expect(toggleWish(text, 'Peu de musées', RULES)).toBe('On adore le vin');
    const full = 'x'.repeat(195);
    expect(toggleWish(full, 'Plutôt nature', RULES)).toBe(full);
  });

  it('champ masqué si la relecture est désactivée', () => {
    expect(aiReviewAvailable(RULES)).toBe(true);
    expect(aiReviewAvailable(mergeRules(RULES, { 'ai.enabled': false }).rules)).toBe(false);
    expect(aiReviewAvailable(mergeRules(RULES, { 'ai.provider': 'off' }).rules)).toBe(false);
  });
});
