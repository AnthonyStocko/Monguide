import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { activityType, allowedByProfile, durationsFor, fitsSlot } from './activity.js';

const p = (category, name = 'X', extra = {}) => ({ category, name, certified: false, indoor: null, ...extra });

describe('activityType / durationsFor', () => {
  it('donne le type d\'activité et ses durées', () => {
    expect(activityType(p('museum'))).toBe('museum');
    expect(activityType(p('monument', 'Château de Montmelas'))).toBe('castle');
    expect(activityType(p('monument', 'Église Notre-Dame'))).toBe('monument');
    expect(activityType(p('viewpoint'))).toBe('smallHeritage');
    expect(activityType(p('park', 'Sentier des Crêtes'))).toBe('trail');
    expect(activityType(p('farm'))).toBe('market');
    expect(durationsFor(p('monument', 'Château de Joux'), RULES)).toEqual({ recommendedMin: 120, minimumMin: 75 });
    expect(durationsFor(null, RULES)).toEqual({ recommendedMin: 60, minimumMin: 30 });
  });
});

describe('allowedByProfile', () => {
  const certified = p('monument', 'MH', { certified: true });
  it('filtre selon le profil', () => {
    expect([certified, p('park'), p('market'), p('viewpoint')].filter((x) => allowedByProfile(x, 'certified'))).toEqual([certified]);
    expect([certified, p('park'), p('market'), p('viewpoint')].filter((x) => allowedByProfile(x, 'balanced')).map((x) => x.category)).toEqual([
      'monument',
      'park',
      'market'
    ]);
    expect([certified, p('park'), p('viewpoint'), p('small_heritage')].filter((x) => allowedByProfile(x, 'explorer'))).toHaveLength(4);
    expect(allowedByProfile(p('restaurant'), 'explorer')).toBe(false);
  });
});

describe('fitsSlot', () => {
  it('répartit les lieux entre les créneaux', () => {
    expect(fitsSlot(p('museum'), 'culture')).toBe(true);
    expect(fitsSlot(p('museum'), 'outdoor')).toBe(false);
    expect(fitsSlot(p('monument', 'Ruines', { indoor: false }), 'outdoor')).toBe(true);
    expect(fitsSlot(p('monument', 'Église', { indoor: true }), 'outdoor')).toBe(false);
    expect(fitsSlot(p('park'), 'relax')).toBe(true);
    expect(fitsSlot(p('small_heritage'), 'relax')).toBe(false);
  });
});
