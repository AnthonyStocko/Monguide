import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { validateTripRequest } from './validateTripRequest.js';

const valid = () => ({
  destination: { name: 'Lisbonne', countryCode: 'PT', lat: 38.72, lon: -9.14, radiusKm: 20 },
  timezone: 'Europe/Lisbon',
  startDate: '2026-10-06',
  endDate: '2026-10-07',
  travelers: 2,
  mode: 'car',
  fuelType: 'sp95',
  profile: 'balanced',
  lunch: 'both',
  dinner: 'restaurant',
  prefs: { vegetarian: false, wheelchair: false },
  lodgings: [{ id: 'l1', address: 'Rua Augusta', lat: 38.71, lon: -9.14, nights: ['2026-10-06'] }]
});

describe('validateTripRequest', () => {
  it('accepte une demande valide', () => {
    expect(validateTripRequest(valid(), RULES)).toEqual([]);
  });

  it.each([
    ['destination', (t) => delete t.destination],
    ['destination.countryCode', (t) => (t.destination.countryCode = 'TR')],
    ['destination.radiusKm', (t) => (t.destination.radiusKm = 17)],
    ['timezone', (t) => (t.timezone = 'Mars/Base')],
    ['endDate', (t) => (t.endDate = '2026-10-20')],
    ['travelers', (t) => (t.travelers = 0)],
    ['fuelType', (t) => (t.fuelType = 'kerosene')],
    ['profile', (t) => (t.profile = 'x')],
    ['lunch', (t) => (t.lunch = 'x')],
    ['dinner', (t) => (t.dinner = 'x')],
    ['prefs', (t) => (t.prefs = null)],
    ['lodgings', (t) => (t.lodgings[0].nights = ['2026-10-09'])],
    ['fuelConsumption', (t) => (t.fuelConsumption = -1)],
    ['params', (t) => (t.params = 'Peu de musées')],
    ['params.wishes', (t) => (t.params = { wishes: 'x'.repeat(201) })],
    ['params.wishes', (t) => (t.params = { wishes: ['Peu de musées'] })]
  ])('refuse un champ %s invalide', (field, mutate) => {
    const t = valid();
    mutate(t);
    expect(validateTripRequest(t, RULES)).toContain(field);
  });

  it('accepte « Vos envies » de 200 caractères au plus', () => {
    const t = valid();
    t.params = { wishes: 'Peu de musées' };
    expect(validateTripRequest(t, RULES)).toEqual([]);
  });

  it("accepte une demande sans dîner (application antérieure)", () => {
    const t = valid();
    delete t.dinner;
    expect(validateTripRequest(t, RULES)).toEqual([]);
  });

  it('refuse deux hébergements pour la même nuit', () => {
    const t = valid();
    t.lodgings.push({ ...t.lodgings[0], id: 'l2' });
    expect(validateTripRequest(t, RULES)).toContain('lodgings');
  });

  it('refuse une demande absente', () => {
    expect(validateTripRequest(null, RULES)).toEqual(['tripRequest']);
  });
});
