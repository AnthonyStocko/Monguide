import { describe, expect, it } from 'vitest';
import { inRollout, rolloutBucket } from './aiRollout.js';

describe('déploiement progressif', () => {
  const ids = Array.from({ length: 4000 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`);

  it('rang stable, entre 0 et 99', () => {
    expect(rolloutBucket('abc')).toBe(rolloutBucket('abc'));
    for (const id of ids.slice(0, 200)) expect(rolloutBucket(id)).toBeGreaterThanOrEqual(0);
    for (const id of ids.slice(0, 200)) expect(rolloutBucket(id)).toBeLessThan(100);
  });

  it('proportion proche du pourcentage ; 0 % : personne ; 100 % : tout le monde', () => {
    const share = (p) => ids.filter((id) => inRollout(id, p)).length / ids.length;
    expect(share(10)).toBeGreaterThan(0.07);
    expect(share(10)).toBeLessThan(0.13);
    expect(share(0)).toBe(0);
    expect(share(100)).toBe(1);
  });

  it('élargir garde les installations déjà concernées', () => {
    for (const id of ids.filter((x) => inRollout(x, 10))) expect(inRollout(id, 50)).toBe(true);
  });

  it('sans identifiant : pas concerné', () => {
    expect(inRollout(undefined, 100)).toBe(false);
    expect(inRollout('', 100)).toBe(false);
  });
});
