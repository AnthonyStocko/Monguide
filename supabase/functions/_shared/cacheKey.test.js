import { describe, expect, it } from 'vitest';
import { cacheKey } from './cacheKey.js';

describe('cacheKey', () => {
  it('se réduit à la source sans paramètre', () => {
    expect(cacheKey('config')).toBe('config');
    expect(cacheKey('config', {})).toBe('config');
  });

  it('arrondit les coordonnées à 0,01°', () => {
    expect(cacheKey('weather', { lat: 48.856613, lon: 2.352222 })).toBe('weather:lat=48.86&lon=2.35');
    expect(cacheKey('weather', { latitude: '48.8', longitude: -0.001 })).toBe('weather:latitude=48.80&longitude=0.00');
  });

  it('partage la clé entre deux positions proches', () => {
    expect(cacheKey('weather', { lat: 48.8566, lon: 2.3522 })).toBe(cacheKey('weather', { lat: 48.8611, lon: 2.3489 }));
  });

  it('ne dépend ni de l\'ordre des paramètres ni de la casse', () => {
    expect(cacheKey('geocode', { q: '  Paris ', lang: 'FR' })).toBe(cacheKey('geocode', { lang: 'fr', q: 'paris' }));
    expect(cacheKey('geocode', { q: 'Saint-Étienne & co' })).toBe('geocode:q=saint-%C3%A9tienne%20%26%20co');
  });

  it('ignore les paramètres vides et gère les listes', () => {
    expect(cacheKey('places', { kinds: ['museum', 'Park'], radius: 3, x: undefined, y: null })).toBe(
      'places:kinds=museum,park&radius=3'
    );
  });
});
