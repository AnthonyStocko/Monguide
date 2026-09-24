import { describe, expect, it } from 'vitest';
import { flattenRules, mergeRules } from './mergeRules.js';

const DEFAULTS = Object.freeze({
  weather: { rainThresholdPct: 50 },
  schedule: { lateEnd: '21:00' },
  places: { regionalCuisines: ['regional'] },
  travel: { modes: { walk: { speedKmh: 4.5 } } }
});

describe('flattenRules', () => {
  it('produit des chemins pointés, les tableaux étant des feuilles', () => {
    expect(flattenRules(DEFAULTS)).toEqual({
      'weather.rainThresholdPct': 50,
      'schedule.lateEnd': '21:00',
      'places.regionalCuisines': ['regional'],
      'travel.modes.walk.speedKmh': 4.5
    });
  });
});

describe('mergeRules', () => {
  it('sans surcharge, renvoie une copie des défauts', () => {
    const { rules, ignored } = mergeRules(DEFAULTS);
    expect(rules).toEqual(DEFAULTS);
    expect(rules).not.toBe(DEFAULTS);
    expect(ignored).toEqual([]);
  });

  it('applique une surcharge valide, y compris en profondeur', () => {
    const { rules } = mergeRules(DEFAULTS, {
      'weather.rainThresholdPct': 60,
      'travel.modes.walk.speedKmh': 5,
      'places.regionalCuisines': ['regional', 'local']
    });
    expect(rules.weather.rainThresholdPct).toBe(60);
    expect(rules.travel.modes.walk.speedKmh).toBe(5);
    expect(rules.places.regionalCuisines).toEqual(['regional', 'local']);
  });

  it('ne modifie jamais les défauts', () => {
    mergeRules(DEFAULTS, { 'weather.rainThresholdPct': 70 });
    expect(DEFAULTS.weather.rainThresholdPct).toBe(50);
  });

  it('ignore les chemins inconnus et les types incorrects', () => {
    const { rules, ignored } = mergeRules(DEFAULTS, {
      'weather.unknown': 1,
      weather: { rainThresholdPct: 10 },
      'weather.rainThresholdPct': '60',
      'schedule.lateEnd': 22,
      'places.regionalCuisines': [1, 2],
      'travel.modes.walk.speedKmh': Number.NaN
    });
    expect(rules).toEqual(DEFAULTS);
    expect(ignored).toHaveLength(6);
  });

  it('permet de réappliquer des règles complètes aplaties (cas de l\'application)', () => {
    const server = mergeRules(DEFAULTS, { 'weather.rainThresholdPct': 60 }).rules;
    const { rules } = mergeRules(DEFAULTS, flattenRules({ ...server, extra: { x: 1 } }));
    expect(rules.weather.rainThresholdPct).toBe(60);
    expect(rules).not.toHaveProperty('extra');
  });
});
