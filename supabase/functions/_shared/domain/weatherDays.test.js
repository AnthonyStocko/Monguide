import { describe, expect, it } from 'vitest';
import { addDays, eachDate } from './dates.js';
import { buildWeatherDays } from './weatherDays.js';

/**
 * Prévision Open-Meteo simulée : `days` jours × 24 h à partir de `first`.
 * Comme l'API réelle, le dernier jour n'a pas de probabilité de pluie
 * (températures et codes seulement). À partir de l'heure `emptyFromHour`,
 * plus aucune valeur.
 */
function forecast(first, days, { emptyFromHour = Infinity } = {}) {
  const time = [];
  const precipitation_probability = [];
  const temperature_2m = [];
  const weather_code = [];
  const lastDayStart = (days - 1) * 24;
  for (const date of eachDate(first, addDays(first, days - 1))) {
    for (let h = 0; h < 24; h += 1) {
      const i = time.length;
      const empty = i >= emptyFromHour;
      time.push(`${date}T${String(h).padStart(2, '0')}:00`);
      precipitation_probability.push(empty || (days > 1 && i >= lastDayStart) ? null : h * 2);
      temperature_2m.push(empty ? null : 15.5);
      weather_code.push(empty ? null : 3);
    }
  }
  return { time, precipitation_probability, temperature_2m, weather_code };
}

describe('buildWeatherDays', () => {
  const today = '2026-09-24';
  const hourly = forecast(today, 16); // forecast_days=16 : J à J+15

  it('séjour de J+12 à J+18 : J+12 à J+15 disponibles, J+16 à J+18 non', () => {
    const days = buildWeatherDays(hourly, addDays(today, 12), addDays(today, 18));
    expect(days.map((d) => [d.date, d.available])).toEqual([
      ['2026-10-06', true],
      ['2026-10-07', true],
      ['2026-10-08', true],
      ['2026-10-09', true],
      ['2026-10-10', false],
      ['2026-10-11', false],
      ['2026-10-12', false]
    ]);
    expect(days[4]).toEqual({ date: '2026-10-10', available: false });
  });

  it('compare les heures comme des chaînes locales, sans conversion', () => {
    const [day] = buildWeatherDays(hourly, today, today);
    expect(day.hours).toHaveLength(24);
    expect(day.hours[0]).toEqual({ hour: '00:00', precipitationProbability: 0, temperature: 15.5, weatherCode: 3 });
    expect(day.hours[23].hour).toBe('23:00');
  });

  it('garde disponible le dernier jour sans probabilité de pluie (inconnue = null)', () => {
    const [last] = buildWeatherDays(hourly, addDays(today, 15), addDays(today, 15));
    expect(last.available).toBe(true);
    expect(last.hours.every((h) => h.precipitationProbability === null && h.temperature === 15.5)).toBe(true);
  });

  it('marque indisponible un jour présent mais sans aucune valeur', () => {
    const partial = forecast(today, 2, { emptyFromHour: 24 });
    const days = buildWeatherDays(partial, today, addDays(today, 1));
    expect(days.map((d) => d.available)).toEqual([true, false]);
  });

  it('garde un jour partiellement connu, avec des valeurs null', () => {
    const partial = forecast(today, 1, { emptyFromHour: 12 });
    const [day] = buildWeatherDays(partial, today, today);
    expect(day.available).toBe(true);
    expect(day.hours[12]).toEqual({ hour: '12:00', precipitationProbability: null, temperature: null, weatherCode: null });
  });

  it('marque indisponibles les jours passés, absents de la prévision', () => {
    const days = buildWeatherDays(hourly, addDays(today, -2), today);
    expect(days.map((d) => d.available)).toEqual([false, false, true]);
  });
});
