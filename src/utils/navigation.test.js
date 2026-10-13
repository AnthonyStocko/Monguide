import { describe, expect, it } from 'vitest';
import { appPathFromUrl, directionsUrl, geoUrl, mapsProvider, telUrl, webUrl } from './navigation.js';

describe('navigation', () => {
  it('construit un lien geo: avec un libellé', () => {
    expect(geoUrl({ lat: 45.9, lon: 4.7 }, 'Musée Paul-Dini')).toBe('geo:45.9,4.7?q=45.9,4.7(Mus%C3%A9e%20Paul-Dini)');
    expect(geoUrl({ lat: 45.9, lon: 4.7 })).toBe('geo:45.9,4.7?q=45.9,4.7');
  });

  it('choisit le service de cartes selon le navigateur', () => {
    expect(mapsProvider('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1')).toBe('apple');
    expect(mapsProvider('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15')).toBe('apple');
    expect(mapsProvider('Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36')).toBe('geo');
    expect(mapsProvider('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36')).toBe('google');
    expect(mapsProvider('')).toBe('google');
  });

  it('construit le lien d’itinéraire : geo:, Plans ou Google Maps', () => {
    const point = { lat: 45.9, lon: 4.7 };
    expect(directionsUrl('geo', point, 'Musée Paul-Dini')).toBe(geoUrl(point, 'Musée Paul-Dini'));
    expect(directionsUrl('apple', point, 'Musée Paul-Dini')).toBe('https://maps.apple.com/?daddr=45.9,4.7');
    expect(directionsUrl('google', point)).toBe('https://www.google.com/maps/dir/?api=1&destination=45.9,4.7');
  });

  it('lien de la version web ouvert dans l’application : chemin interne, rien pour une autre adresse', () => {
    const web = 'https://app.example.org';
    expect(appPathFromUrl('https://app.example.org/planning/t1?day=2026-10-20&step=s1', web)).toBe('/planning/t1?day=2026-10-20&step=s1');
    expect(appPathFromUrl('https://app.example.org/', web)).toBe('/');
    expect(appPathFromUrl('https://evil.example/planning/t1', web)).toBeNull();
    expect(appPathFromUrl('https://app.example.org.evil.example/planning/t1', web)).toBeNull();
    expect(appPathFromUrl('pas une adresse', web)).toBeNull();
    expect(appPathFromUrl('https://app.example.org/planning/t1', '')).toBeNull();
  });

  it('construit des liens tel: et web', () => {
    expect(telUrl('+33 4 74 00-00-00')).toBe('tel:+33474000000');
    expect(webUrl('museepompiers.com/')).toBe('https://museepompiers.com/');
    expect(webUrl('http://a.fr')).toBe('http://a.fr');
  });
});
