import { describe, expect, it } from 'vitest';
import { middayWeather, nextTrip, tripStatus, weatherKind } from './tripStatus.js';

const trip = (id, startDate, endDate) => ({ id, startDate, endDate, timezone: 'Europe/Paris' });

describe('tripStatus', () => {
  it('à venir, en cours, terminé', () => {
    expect(tripStatus(trip('a', '2026-10-10', '2026-10-12'), '2026-10-08')).toEqual({ status: 'upcoming', daysUntil: 2, dayCount: 3 });
    expect(tripStatus(trip('a', '2026-10-10', '2026-10-12'), '2026-10-11')).toEqual({ status: 'current', dayNumber: 2, dayCount: 3 });
    expect(tripStatus(trip('a', '2026-10-10', '2026-10-12'), '2026-10-13')).toEqual({ status: 'past', dayCount: 3 });
  });
});

describe('nextTrip', () => {
  it('le séjour en cours, sinon le plus proche à venir, sinon rien', () => {
    const today = new Date().toISOString().slice(0, 10);
    const future = (days) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
    expect(nextTrip([trip('far', future(30), future(32)), trip('near', future(5), future(6))]).trip.id).toBe('near');
    expect(nextTrip([trip('near', future(5), future(6)), trip('now', future(-1), future(1))]).trip.id).toBe('now');
    expect(nextTrip([trip('old', '2020-01-01', '2020-01-02')])).toBeNull();
    expect(today).toMatch(/^\d{4}-/);
  });
});

describe('météo de la mi-journée', () => {
  it('température arrondie et type de temps', () => {
    const day = { available: true, hours: [{ hour: '12:00', temperature: 20.6, weatherCode: 2 }, { hour: '13:00', temperature: 21.4, weatherCode: 61 }] };
    expect(middayWeather(day)).toEqual({ temperature: 21, kind: 'rain' });
    expect(middayWeather({ available: false })).toBeNull();
    expect(weatherKind(0)).toBe('clear');
    expect(weatherKind(99)).toBe('storm');
  });
});
