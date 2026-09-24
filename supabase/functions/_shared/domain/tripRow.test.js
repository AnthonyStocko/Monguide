import { describe, expect, it } from 'vitest';
import { rowToTrip, tripToRow } from './tripRow.js';

const trip = {
  schemaVersion: 1,
  id: '5a1f0c4e-1111-4222-8333-944445555666',
  title: 'Annecy',
  createdAt: '2026-09-24T10:00:00.000Z',
  updatedAt: '2026-09-24T11:00:00.000Z',
  deleted: false,
  destination: { name: 'Annecy', countryCode: 'FR', lat: 45.9, lon: 6.13, radiusKm: 20 },
  timezone: 'Europe/Paris',
  currency: 'EUR',
  startDate: '2026-10-01',
  endDate: '2026-10-03',
  travelers: 2,
  mode: 'car',
  fuelType: 'diesel',
  profile: 'balanced',
  lunch: 'both',
  prefs: { vegetarian: false, wheelchair: false },
  lodgings: [{ id: 'l', address: 'x', lat: 1, lon: 2, nights: ['2026-10-01'] }],
  days: [{ date: '2026-10-01', weatherAvailable: true, steps: [] }],
  candidates: [{ id: 'c' }],
  carbon: { totalKgCo2e: 1, byDay: [1], byMode: {}, distanceKm: 3 }
};

describe('tripToRow / rowToTrip', () => {
  it('répartit le séjour entre colonnes propres, planning et params', () => {
    const row = tripToRow(trip);
    expect(row).toMatchObject({
      id: trip.id,
      title: 'Annecy',
      start_date: '2026-10-01',
      end_date: '2026-10-03',
      created_at: trip.createdAt,
      updated_at: trip.updatedAt,
      deleted: false,
      planning: trip.days,
      destination: trip.destination
    });
    expect(Object.keys(row.params).sort()).toEqual(['candidates', 'carbon', 'currency', 'fuelType', 'lodgings', 'lunch', 'mode', 'prefs', 'profile', 'schemaVersion', 'timezone', 'travelers']);
    expect(row).not.toHaveProperty('user_id');
  });

  it('reconstruit exactement le séjour', () => {
    const row = { ...tripToRow(trip), user_id: 'u', updated_at: '2026-09-24T11:00:00+00:00' };
    expect(rowToTrip(row)).toEqual(trip);
  });

  it('n\'envoie aucun contenu pour un séjour supprimé', () => {
    const row = tripToRow({ ...trip, deleted: true, updatedAt: '2026-09-25T08:00:00.000Z' });
    expect(row).toEqual({
      id: trip.id,
      title: '',
      destination: {},
      start_date: '2026-10-01',
      end_date: '2026-10-03',
      params: {},
      planning: [],
      created_at: trip.createdAt,
      updated_at: '2026-09-25T08:00:00.000Z',
      deleted: true
    });
  });
});
