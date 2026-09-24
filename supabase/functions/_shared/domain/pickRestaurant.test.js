import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { lunchKindForDay, lunchOpeningState, pickRestaurant } from './pickRestaurant.js';

const HERE = { lat: 45.99, lon: 4.72 };
const MONDAY = '2026-10-05';
const TUESDAY = '2026-10-06';
const resto = (id, food = {}, pos = HERE) => ({
  id,
  name: id,
  category: 'restaurant',
  ...pos,
  source: 'osm',
  certified: false,
  indoor: true,
  food: { regional: false, ...food }
});
const ctx = (patch = {}) => ({
  date: TUESDAY,
  countryCode: 'FR',
  near: [HERE],
  effectiveRadiusKm: 10,
  prefs: { vegetarian: false, wheelchair: false },
  usedIds: new Set(),
  ...patch
});

describe('lunchOpeningState', () => {
  const where = { ...HERE, countryCode: 'FR' };
  it('évalue la plage 12h30-14h00 du jour', () => {
    expect(lunchOpeningState('Tu-Sa 12:00-14:00', { ...where, date: MONDAY }, RULES)).toBe('closed');
    expect(lunchOpeningState('Tu-Sa 12:00-14:00', { ...where, date: TUESDAY }, RULES)).toBe('open');
    expect(lunchOpeningState('Mo-Su 19:00-22:00', { ...where, date: TUESDAY }, RULES)).toBe('closed');
    expect(lunchOpeningState('Mo-Su 13:30-15:00', { ...where, date: TUESDAY }, RULES)).toBe('open');
  });

  it('tient compte des jours fériés du pays', () => {
    expect(lunchOpeningState('Mo-Su 12:00-14:00; PH off', { ...where, date: '2026-07-14' }, RULES)).toBe('closed');
    expect(lunchOpeningState('Mo-Su 12:00-14:00; PH off', { lat: 43.77, lon: 11.25, countryCode: 'IT', date: '2027-08-15' }, RULES)).toBe('closed');
  });

  it('renvoie "unknown" pour des horaires absents ou illisibles', () => {
    expect(lunchOpeningState(undefined, { ...where, date: TUESDAY }, RULES)).toBe('unknown');
    expect(lunchOpeningState('n importe quoi', { ...where, date: TUESDAY }, RULES)).toBe('unknown');
  });
});

describe('pickRestaurant', () => {
  it('exclut un restaurant fermé le lundi midi, un lundi', () => {
    const closedMonday = resto('closed-monday', { openingHours: 'Tu-Sa 12:00-14:00' });
    expect(pickRestaurant([closedMonday], ctx({ date: MONDAY }), RULES)).toBeNull();
    expect(pickRestaurant([closedMonday], ctx({ date: TUESDAY }), RULES)?.place.id).toBe('closed-monday');
  });

  it('garde un restaurant sans horaires, avec le badge "Horaires non confirmés" et un malus', () => {
    const noHours = resto('no-hours');
    const withHours = resto('with-hours', { openingHours: 'Mo-Su 12:00-14:30' });
    const picked = pickRestaurant([noHours], ctx(), RULES);
    expect(picked).toMatchObject({ place: { id: 'no-hours' }, badges: ['hours_unconfirmed'] });
    expect(pickRestaurant([noHours, withHours], ctx(), RULES).place.id).toBe('with-hours');
  });

  it('préférence végétarienne : exclut "diet:vegetarian=no", signale l\'information absente', () => {
    const no = resto('no', { openingHours: 'Mo-Su 12:00-14:00', vegetarian: false });
    const unknown = resto('unknown', { openingHours: 'Mo-Su 12:00-14:00' });
    const yes = resto('yes', { openingHours: 'Mo-Su 12:00-14:00', vegetarian: true });
    const prefs = { vegetarian: true, wheelchair: false };
    expect(pickRestaurant([no], ctx({ prefs }), RULES)).toBeNull();
    expect(pickRestaurant([no, unknown], ctx({ prefs }), RULES)).toMatchObject({ place: { id: 'unknown' }, badges: ['info_missing'] });
    expect(pickRestaurant([unknown, yes], ctx({ prefs }), RULES).place.id).toBe('yes');
  });

  it('fauteuil roulant : exclut "wheelchair=no"', () => {
    const no = resto('no', { openingHours: 'Mo-Su 12:00-14:00', wheelchair: 'no' });
    expect(pickRestaurant([no], ctx({ prefs: { vegetarian: false, wheelchair: true } }), RULES)).toBeNull();
  });

  it('favorise la cuisine régionale et la proximité, et ne propose jamais deux fois le même', () => {
    const regional = resto('regional', { openingHours: 'Mo-Su 12:00-14:00', regional: true });
    const plain = resto('plain', { openingHours: 'Mo-Su 12:00-14:00' });
    const far = resto('far', { openingHours: 'Mo-Su 12:00-14:00', regional: true }, { lat: 46.07, lon: 4.72 });
    expect(pickRestaurant([plain, far, regional], ctx(), RULES).place.id).toBe('regional');
    expect(pickRestaurant([plain, regional], ctx({ usedIds: new Set(['regional']) }), RULES).place.id).toBe('plain');
  });
});

describe('lunchKindForDay', () => {
  it('alterne en mode "Les deux", restaurant le premier jour', () => {
    expect([0, 1, 2, 3].map((i) => lunchKindForDay('both', i))).toEqual(['restaurant', 'market', 'restaurant', 'market']);
    expect(lunchKindForDay('market', 0)).toBe('market');
    expect(lunchKindForDay('restaurant', 1)).toBe('restaurant');
  });
});
