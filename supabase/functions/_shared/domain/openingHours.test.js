import { describe, expect, it } from 'vitest';
import { openingHoursOfDay, openingState, placeOpeningHours } from './openingHours.js';

const where = { lat: 45.99, lon: 4.72, countryCode: 'FR' };
const TUESDAY = '2026-10-06';

describe('openingState', () => {
  it('distingue ouvert, partiellement ouvert et fermé', () => {
    const oh = 'Tu-Sa 12:00-14:00';
    expect(openingState(oh, { ...where, date: TUESDAY, from: '12:30', to: '13:45' })).toBe('open');
    expect(openingState(oh, { ...where, date: TUESDAY, from: '13:30', to: '14:30' })).toBe('partial');
    expect(openingState(oh, { ...where, date: TUESDAY, from: '14:30', to: '15:30' })).toBe('closed');
    expect(openingState(oh, { ...where, date: '2026-10-05', from: '12:30', to: '13:30' })).toBe('closed');
  });

  it('renvoie "unknown" pour des horaires absents ou illisibles', () => {
    expect(openingState(undefined, { ...where, date: TUESDAY, from: '12:30', to: '13:30' })).toBe('unknown');
    expect(openingState('xyz', { ...where, date: TUESDAY, from: '12:30', to: '13:30' })).toBe('unknown');
  });
});

describe('openingHoursOfDay', () => {
  it('donne les horaires du jour en clair', () => {
    expect(openingHoursOfDay('Tu-Sa 12:00-14:00,19:00-22:00', { ...where, date: TUESDAY })).toBe('12:00–14:00, 19:00–22:00');
    expect(openingHoursOfDay('Tu-Sa 12:00-14:00', { ...where, date: '2026-10-05' })).toBe('');
    expect(openingHoursOfDay(undefined, { ...where, date: TUESDAY })).toBeNull();
  });
});

describe('placeOpeningHours', () => {
  it('lit les horaires d\'un restaurant', () => {
    expect(placeOpeningHours({ food: { openingHours: 'Mo 10:00-12:00' } })).toBe('Mo 10:00-12:00');
    expect(placeOpeningHours({})).toBeUndefined();
  });
});
