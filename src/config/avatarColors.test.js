import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../utils/contrast.js';
import { AVATAR_COLORS, avatarColor } from './avatarColors.js';

describe('avatarColors', () => {
  it('initiale blanche lisible sur chaque couleur (4,5:1 au moins)', () => {
    for (const [name, hex] of Object.entries(AVATAR_COLORS)) expect(contrastRatio('#ffffff', hex), name).toBeGreaterThanOrEqual(4.5);
  });

  it('couleur du profil, sinon couleur stable déduite de l’identifiant', () => {
    expect(avatarColor('teal')).toBe(AVATAR_COLORS.teal);
    expect(avatarColor('inconnue', 'abc')).toBe(avatarColor(null, 'abc'));
    expect(Object.values(AVATAR_COLORS)).toContain(avatarColor(null, 'abc'));
  });
});
