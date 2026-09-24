import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FORECAST_DAYS, fetchHourlyForecast } from './weather.js';

describe('fetchHourlyForecast', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('demande 16 jours de prévision horaire dans le fuseau du séjour', async () => {
    const hourly = { time: ['2026-09-24T00:00'], precipitation_probability: [5], temperature_2m: [12], weather_code: [1] };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ hourly })));
    expect(await fetchHourlyForecast({ lat: 45.99, lon: 4.73 }, 'Europe/Paris')).toEqual(hourly);

    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/forecast');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: '45.99',
      longitude: '4.73',
      hourly: 'precipitation_probability,temperature_2m,weather_code',
      timezone: 'Europe/Paris',
      forecast_days: '16'
    });
    expect(FORECAST_DAYS).toBe(16);
  });

  it('refuse une réponse sans données horaires', async () => {
    fetchMock.mockResolvedValue(new Response('{}'));
    await expect(fetchHourlyForecast({ lat: 45.99, lon: 4.73 }, 'Europe/Paris')).rejects.toThrow(TypeError);
  });
});
