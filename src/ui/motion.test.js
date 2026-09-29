import { describe, expect, it } from 'vitest';
import { DURATION, MAX_ANIMATED, SPRING, STAGGER, cascadeProps, variants } from './motion.js';

describe('système d’animation', () => {
  it('durées : rapide 150 ms, standard 250 ms, emphase 450 ms', () => {
    expect(DURATION).toEqual({ fast: 0.15, standard: 0.25, emphasis: 0.45 });
  });

  it('cascade : 50 ms entre deux éléments, 20 éléments animés au plus', () => {
    expect(STAGGER).toBe(0.05);
    expect(variants.appear.visible(3).transition.delay).toBeCloseTo(0.15);
    expect(cascadeProps(19, true).initial).toBe('hidden');
    expect(cascadeProps(MAX_ANIMATED, true).initial).toBe(false);
  });

  it('animations refusées ou déjà affiché : place finale directement', () => {
    expect(cascadeProps(0, false)).toMatchObject({ initial: false, animate: 'visible' });
  });

  it('variantes : transform et opacity uniquement', () => {
    const allowed = new Set(['opacity', 'x', 'y', 'scale', 'transition']);
    for (const variant of Object.values(variants)) {
      for (const state of Object.values(variant)) {
        const value = typeof state === 'function' ? state(1) : state;
        for (const key of Object.keys(value)) expect(allowed.has(key), key).toBe(true);
      }
    }
  });

  it('rebond court', () => {
    expect(SPRING).toMatchObject({ type: 'spring' });
  });
});
