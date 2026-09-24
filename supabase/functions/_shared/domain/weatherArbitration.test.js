import { describe, expect, it } from 'vitest';
import { RULES } from './config/rules.js';
import { arbitrateWeather, averageRain, dayWeather } from './weatherArbitration.js';

const park = { id: 'park', name: 'Parc', category: 'park', lat: 45.99, lon: 4.72, indoor: false };
const ruins = { id: 'ruins', name: 'Ruines', category: 'monument', lat: 45.99, lon: 4.73, indoor: null };
const museumNear = { id: 'museum-near', name: 'Musée', category: 'museum', lat: 45.991, lon: 4.721, indoor: true };
const museumFar = { id: 'museum-far', name: 'Musée loin', category: 'museum', lat: 46.2, lon: 4.9, indoor: true };
const step = (type, place, start, end) => ({ id: type, type, place, indoor: place.indoor, start, end, badges: [] });

describe('averageRain / dayWeather', () => {
  it('fait la moyenne sur les heures du créneau', () => {
    expect(averageRain({ 14: 40, 15: 80 }, '14:30', '16:00')).toBe(60);
    expect(averageRain({}, '14:30', '16:00')).toBeNull();
  });

  it('extrait les probabilités heure par heure d\'un jour couvert', () => {
    expect(dayWeather({ available: true, hours: [{ hour: '09:00', precipitationProbability: 30 }, { hour: '10:00', precipitationProbability: null }] })).toEqual({ '09': 30 });
    expect(dayWeather({ available: false })).toBeUndefined();
  });
});

describe('arbitrateWeather', () => {
  const rainy = (pct) => ({ weatherAvailable: true, weather: Object.fromEntries(Array.from({ length: 24 }, (_, h) => [String(h).padStart(2, '0'), pct])), steps: [step('outdoor', park, '14:30', '16:00'), step('relax', ruins, '17:30', '18:30')] });

  it('au-delà de 50 % : remplace les étapes extérieures par le lieu intérieur le plus proche', () => {
    const used = new Set(['park', 'ruins']);
    const { steps, swapped } = arbitrateWeather(rainy(80), [museumFar, museumNear], used, RULES);
    expect(swapped).toBe(2);
    expect(steps[0]).toMatchObject({ place: { id: 'museum-near' }, indoor: true, badges: ['weather_adapted'] });
    expect(steps[1].place.id).toBe('museum-far');
    expect([...used].sort()).toEqual(['museum-far', 'museum-near']);
  });

  it('en dessous du seuil ou jour non couvert : rien ne change', () => {
    expect(arbitrateWeather(rainy(50), [museumNear], new Set(), RULES).swapped).toBe(0);
    expect(arbitrateWeather({ ...rainy(90), weatherAvailable: false }, [museumNear], new Set(), RULES).swapped).toBe(0);
  });

  it('ne touche pas à une étape verrouillée ni à la pause déjeuner', () => {
    const day = rainy(90);
    day.steps = [{ ...day.steps[0], locked: true }, { ...step('lunch', { ...park, id: 'market', category: 'market' }, '12:30', '13:15') }];
    expect(arbitrateWeather(day, [museumNear], new Set(), RULES).swapped).toBe(0);
  });
});
